import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { BILLING_ACCESS_COOKIE, readBillingAccess } from "../../../../utils/auth/portal-otp";
import { loadBillingItems, monthStatement } from "../../../../utils/billing/statement";
import { chkfake, inipayConfig, newOrderId } from "../../../../utils/billing/inipay";

export const dynamic = "force-dynamic";

// Creates a pending order for one month and returns the signed fields the
// browser passes to INIPayPro.requestPayment. The amount is computed here,
// never taken from the client.
export async function POST(request: NextRequest) {
  const config = inipayConfig();
  if (!config) return errorResponse("결제 게이트웨이가 아직 연결되지 않았습니다.", 503);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,account_status")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "parent" || profile.account_status !== "approved") {
    return errorResponse("보호자 계정만 이용할 수 있습니다.", 403);
  }
  if (!readBillingAccess(request.cookies.get(BILLING_ACCESS_COOKIE)?.value, user.id, request.headers)) {
    return errorResponse("결제 내역 잠금을 다시 해제해 주세요.", 403);
  }

  const body = await request.json().catch(() => ({}));
  const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : null;
  if (!month) return errorResponse("결제 월을 확인해 주세요.", 400);

  const statement = monthStatement(await loadBillingItems(user.id), month);
  if (!statement.totalKrw) return errorResponse("결제할 금액이 아직 확정되지 않았습니다.", 409);

  const admin = createAdminClient();
  const { data: paid } = await admin
    .from("billing_payments")
    .select("id")
    .eq("parent_id", user.id)
    .eq("billing_month", month)
    .eq("status", "paid")
    .maybeSingle();
  if (paid) return errorResponse("이미 결제가 완료된 달입니다.", 409);

  const orderId = newOrderId();
  const { error } = await admin.from("billing_payments").insert({
    order_id: orderId,
    parent_id: user.id,
    billing_month: month,
    amount_krw: statement.totalKrw,
    session_ids: statement.items.map((item) => item.id),
  });
  if (error) {
    console.error("Billing payment order insert failed", { code: error.code, message: error.message });
    return errorResponse("결제를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  }

  const origin = request.nextUrl.origin;
  const timestamp = String(Date.now());
  const [year, monthNumber] = month.split("-");
  const mobile = /Mobi|Android|iPhone|iPad/i.test(request.headers.get("user-agent") || "");
  const email = profile.email || user.email;

  return NextResponse.json(
    {
      P_MID: config.mid,
      P_OID: orderId,
      P_PAY_TYPE: "CARD:BANK",
      P_DEVICE_TYPE: mobile ? "MOBILE" : "WEB",
      P_IDCCODE: "Y",
      P_AMT: String(statement.totalKrw),
      P_GOODS: `선배 ${year}년 ${Number(monthNumber)}월 수업료`,
      P_UNAME: (profile.full_name || email || "보호자").slice(0, 30),
      P_NEXT_URL: `${origin}/api/billing/payment/return`,
      P_CLOSE_URL: `${origin}/portal/billing?payment=closed`,
      P_CHARSET: "UTF-8",
      P_LANG: body.locale === "en" ? "en" : "ko",
      P_TIMESTAMP: timestamp,
      P_CHKFAKE: chkfake(statement.totalKrw, orderId, timestamp, config.hashKey),
      P_RESERVED: email ? JSON.stringify({ email }) : "",
    },
    { headers: noStoreHeaders() },
  );
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStoreHeaders() });
}

function noStoreHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
}
