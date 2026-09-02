import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  authRateLimitResponse,
  consumeAuthRateLimit,
} from "../../../../utils/auth/rate-limit";
import {
  decodeJwtClaims,
  maskEmail,
  readAccessGate,
  sessionBindingFromClaims,
  signAccessGate,
  USER_CHALLENGE_COOKIE,
  verificationCodeDigest,
} from "../../../../utils/auth/access-gate";
import {
  issueUserChallenge,
  setUserVerified,
} from "../../../../utils/auth/step-up-server";
import { resolvePortalDestination } from "../../../../utils/auth/portal-destination";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await userContext();
  if ("response" in context) return context.response;

  const cookieStore = await cookies();
  const challenge = await readAccessGate(
    cookieStore.get(USER_CHALLENGE_COOKIE)?.value,
    "user-challenge",
    context.identity,
  );
  return NextResponse.json({
    challengePending: Boolean(challenge),
    email: maskEmail(context.email),
    expiresAt: challenge?.expiresAt ?? null,
  }, noStore());
}

export async function PUT(request: NextRequest) {
  const limit = await consumeAuthRateLimit(request, "authenticate");
  if (!limit.allowed) return authRateLimitResponse(limit.retryAfterSeconds);

  const context = await userContext();
  if ("response" in context) return context.response;
  const cookieStore = await cookies();
  const remember = cookieStore.get("seonbae-remember")?.value !== "0";

  try {
    const challenge = await issueUserChallenge({
      userId: context.user.id,
      email: context.email,
      sessionId: context.identity.sessionId,
      remember,
    });
    return NextResponse.json({
      sent: true,
      email: maskEmail(context.email),
      expiresAt: challenge.expiresAt,
    }, noStore());
  } catch (error) {
    console.error("Step-up resend failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503, ...noStore() },
    );
  }
}

export async function POST(request: NextRequest) {
  const limit = await consumeAuthRateLimit(request, "authenticate");
  if (!limit.allowed) return authRateLimitResponse(limit.retryAfterSeconds);

  const context = await userContext();
  if ("response" in context) return context.response;

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("인증 코드를 다시 확인해 주세요.", 400);
  }
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "").slice(0, 6) : "";
  if (code.length !== 6) return error("6자리 인증 코드를 입력해 주세요.", 400);

  const cookieStore = await cookies();
  const challenge = await readAccessGate(
    cookieStore.get(USER_CHALLENGE_COOKIE)?.value,
    "user-challenge",
    context.identity,
  );
  if (!challenge?.codeDigest) {
    return NextResponse.json(
      { error: "인증 코드가 만료되었습니다. 새 코드를 받아 주세요.", needsChallenge: true },
      { status: 410, ...noStore() },
    );
  }

  const candidate = await verificationCodeDigest({
    code,
    userId: context.user.id,
    sessionId: context.identity.sessionId,
    expiresAt: challenge.expiresAt,
  });
  if (!constantTimeTextEqual(candidate, challenge.codeDigest)) {
    const attempts = (challenge.attempts ?? 0) + 1;
    if (attempts >= 5) {
      cookieStore.delete(USER_CHALLENGE_COOKIE);
      return NextResponse.json(
        { error: "입력 횟수를 초과했습니다. 새 코드를 받아 주세요.", needsChallenge: true },
        { status: 429, ...noStore() },
      );
    }
    const updated = await signAccessGate({ ...challenge, attempts });
    cookieStore.set(USER_CHALLENGE_COOKIE, updated, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000)),
    });
    return NextResponse.json(
      { error: `인증 코드가 일치하지 않습니다. ${5 - attempts}번 더 시도할 수 있습니다.` },
      { status: 401, ...noStore() },
    );
  }

  await setUserVerified({
    userId: context.user.id,
    sessionId: context.identity.sessionId,
    remember: challenge.remember === true,
  });
  const destination = await resolvePortalDestination(context.user.id, context.profile);
  return NextResponse.json({ verified: true, destination }, noStore());
}

async function userContext() {
  const supabase = await createClient();
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const user = userData.user;
  if (!user) return { response: error("로그인이 필요합니다.", 401) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,account_status")
    .eq("id", user.id)
    .single();
  if (profile?.role === "admin") {
    return { response: error("관리자 보안 확인 화면을 이용해 주세요.", 403) };
  }

  const sessionId = sessionBindingFromClaims(
    decodeJwtClaims(sessionData.session?.access_token),
  );
  const email = profile?.email || user.email || "";
  if (!sessionId || !email) {
    return { response: error("로그인 세션을 확인하지 못했습니다.", 401) };
  }
  return {
    user,
    profile,
    email,
    identity: { userId: user.id, sessionId },
  };
}

function constantTimeTextEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, ...noStore() });
}

function noStore() {
  return { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } };
}
