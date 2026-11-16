import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../utils/supabase/admin";
import {
  approvePayment,
  inipayConfig,
  isIdcName,
  netCancelPayment,
} from "../../../../../utils/billing/inipay";

export const dynamic = "force-dynamic";

// P_NEXT_URL. INIPay posts the auth result here from its own page, so the
// SameSite session cookie is not sent: the unguessable order id identifies the
// payment. The posted form is unauthenticated, so nothing in it is written:
// only the approval API's answer moves an order to paid or failed. An auth
// that is never approved expires at INIPay without a charge.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const field = (name: string) => String(form?.get(name) ?? "");
  const orderId = field("P_OID");
  const config = inipayConfig();
  if (!config || !orderId) return back(request, "failed");

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("billing_payments")
    .select("id,order_id,parent_id,billing_month,amount_krw,status")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!order) return back(request, "failed");
  if (field("P_STATUS") !== "00") return back(request, "failed");

  const idcName = field("P_IDCNAME");
  const authTid = field("P_AUTH_TID");
  if (!isIdcName(idcName) || !authTid || field("P_MID") !== config.mid || Number(field("P_AMT")) !== order.amount_krw) {
    console.error("INIPay auth result did not match the order", { orderId, idcName });
    return back(request, "failed");
  }

  const finish = (values: Record<string, unknown>) =>
    admin
      .from("billing_payments")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", order.id);

  // Claim the order so a replayed post cannot approve it twice.
  const { data: claimed } = await admin
    .from("billing_payments")
    .update({ status: "approving", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed?.length) return back(request, order.status === "paid" ? "paid" : "failed");

  // A second tab may have paid this month already. Stop before charging.
  const { data: alreadyPaid } = await admin
    .from("billing_payments")
    .select("id")
    .eq("parent_id", order.parent_id)
    .eq("billing_month", order.billing_month)
    .eq("status", "paid")
    .limit(1);
  if (alreadyPaid?.length) {
    await finish({ status: "failed", result_message: "이미 결제가 완료된 달입니다." });
    return back(request, "paid");
  }

  let result: URLSearchParams;
  try {
    result = await approvePayment(idcName, { mid: config.mid, authTid, amount: order.amount_krw });
  } catch (error) {
    // The approval may have gone through without an answer reaching us.
    console.error("INIPay approval request failed", { orderId, message: (error as Error).message });
    const cancelled = await cancel(idcName, authTid, order.amount_krw, orderId, config);
    await finish(cancelled
      ? { status: "failed", result_message: "승인 요청에 실패했습니다." }
      : { status: "unreconciled", result_message: "승인 응답을 받지 못했고 망취소도 실패했습니다. 가맹점관리자에서 확인이 필요합니다." });
    return back(request, "failed");
  }

  if (result.get("P_STATUS") !== "00") {
    await finish({
      status: "failed",
      result_code: result.get("P_STATUS"),
      result_message: (result.get("P_RMESG") || "").slice(0, 500),
    });
    return back(request, "failed");
  }

  const approvalTid = result.get("P_APPL_TID") || result.get("P_TID");
  const approvedMatches = result.get("P_OID") === orderId && Number(result.get("P_AMT")) === order.amount_krw;
  const { error } = approvedMatches
    ? await finish({
        status: "paid",
        pay_type: result.get("P_TYPE"),
        approval_tid: approvalTid,
        approved_at: new Date().toISOString(),
        result_code: "00",
        result_message: (result.get("P_RMESG") || "").slice(0, 500),
      })
    : { error: { message: "approval did not match the order" } };

  if (error) {
    // Charged but not recorded: undo the charge rather than keep money the
    // ledger does not show. A second paid row for the month also lands here.
    console.error("INIPay approval could not be recorded", { orderId, message: error.message });
    const cancelled = await cancel(idcName, authTid, order.amount_krw, orderId, config);
    await finish(cancelled
      ? { status: "failed", approval_tid: approvalTid, result_message: "결제 기록에 실패해 승인을 취소했습니다." }
      : { status: "unreconciled", approval_tid: approvalTid, result_message: "결제 기록과 망취소가 모두 실패했습니다. 가맹점관리자에서 환불이 필요합니다." });
    return back(request, "failed");
  }

  return back(request, "paid");
}

async function cancel(
  idcName: string,
  authTid: string,
  amount: number,
  orderId: string,
  config: { mid: string; hashKey: string },
) {
  try {
    const result = await netCancelPayment(idcName, { ...config, authTid, amount, orderId, reason: "가맹점 처리 오류" });
    if (result.get("P_STATUS") === "00") return true;
    console.error("INIPay net cancel was refused", { orderId, status: result.get("P_STATUS"), message: result.get("P_RMESG") });
  } catch (error) {
    console.error("INIPay net cancel failed", { orderId, message: (error as Error).message });
  }
  return false;
}

// 303 turns the cross-site POST into a GET, which carries the session cookie.
function back(request: NextRequest, payment: "paid" | "failed" | "closed") {
  return NextResponse.redirect(new URL(`/portal/billing?payment=${payment}`, request.url), 303);
}
