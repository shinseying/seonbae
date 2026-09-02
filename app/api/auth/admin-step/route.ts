import { NextRequest, NextResponse } from "next/server";
import {
  authRateLimitResponse,
  consumeAuthRateLimit,
} from "../../../../utils/auth/rate-limit";
import {
  decodeJwtClaims,
  isAdminPhraseValid,
  sessionBindingFromClaims,
} from "../../../../utils/auth/access-gate";
import { setAdminPhraseVerified } from "../../../../utils/auth/step-up-server";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limit = await consumeAuthRateLimit(request, "authenticate");
  if (!limit.allowed) return authRateLimitResponse(limit.retryAfterSeconds);

  let body: { phrase?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("보안 문구를 다시 확인해 주세요.", 400);
  }
  const phrase = typeof body.phrase === "string" ? body.phrase.slice(0, 128) : "";

  const supabase = await createClient();
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  if (!userData.user) return error("관리자 로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profile?.role !== "admin") return error("관리자 권한이 필요합니다.", 403);

  const sessionId = sessionBindingFromClaims(
    decodeJwtClaims(sessionData.session?.access_token),
  );
  if (!sessionId) return error("관리자 세션을 확인하지 못했습니다.", 401);
  if (!phrase || !(await isAdminPhraseValid(phrase))) {
    return error("보안 문구가 일치하지 않습니다.", 401);
  }

  await setAdminPhraseVerified({ userId: userData.user.id, sessionId });
  return NextResponse.json(
    { verified: true, destination: "/admin-shell" },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

function error(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
