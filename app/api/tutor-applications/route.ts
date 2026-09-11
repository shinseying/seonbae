import { NextRequest, NextResponse } from "next/server";
import { authRateLimitResponse, consumeAuthRateLimit } from "../../../utils/auth/rate-limit";
import { createAdminClient } from "../../../utils/supabase/admin";
import { verifyApplicationToken } from "../../../utils/auth/application-handle";

export const dynamic = "force-dynamic";

// Old accountless applications caused duplicate tutor records. Keep the URL
// explicit for stale clients, but refuse new writes and point them to signup.
export async function POST() {
  return NextResponse.json(
    {
      error: "튜터 지원은 계정 회원가입에서 진행해 주세요.",
      destination: "/login?mode=signup&role=tutor",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

const SOURCES = new Set(["online", "kakao", "friend", "other"]);

// Records where the applicant heard about us, once, from the thank-you page.
export async function PATCH(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "signup");
  if (!rateLimit.allowed) return authRateLimitResponse(rateLimit.retryAfterSeconds);

  let body: { id?: unknown; token?: unknown; source?: unknown; referrer?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const id = Number(body.id);
  const token = typeof body.token === "string" ? body.token : "";
  const source = typeof body.source === "string" ? body.source : "";
  const referrer = typeof body.referrer === "string" ? body.referrer.trim().slice(0, 80) : "";

  if (!Number.isInteger(id) || !verifyApplicationToken(id, token)) {
    return error("지원서를 확인하지 못했습니다.", 403);
  }
  if (!SOURCES.has(source)) return error("항목을 선택해 주세요.", 400);
  if (source === "friend" && !referrer) return error("추천인 이름을 입력해 주세요.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("지원 시스템이 아직 설정되지 않았습니다.", 503);
  }

  // Answered once. A second submission for the same application is ignored so
  // a shared link cannot overwrite the original answer.
  const { data: row } = await admin
    .from("account_creation_requests")
    .select("id,referral_code")
    .eq("id", id)
    .single();
  if (!row) return error("지원서를 확인하지 못했습니다.", 404);
  if (row.referral_code) return NextResponse.json({ ok: true });

  const { error: updateError } = await admin
    .from("account_creation_requests")
    .update({
      referral_code: source === "friend" ? `friend: ${referrer}` : source,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) return error("답변을 저장하지 못했습니다.", 500);
  return NextResponse.json({ ok: true });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
