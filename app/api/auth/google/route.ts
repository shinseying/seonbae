import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import {
  authRateLimitResponse,
  consumeAuthRateLimit,
} from "../../../../utils/auth/rate-limit";
import {
  createGoogleLoginAttempt,
  GOOGLE_LOGIN_ATTEMPT_COOKIE,
  GOOGLE_LOGIN_ATTEMPT_MAX_AGE,
} from "../../../../utils/auth/google-login-attempt";
import { safeInternalDestination } from "../../../../utils/auth/safe-destination";

export const dynamic = "force-dynamic";

type GoogleAuthBody = {
  mode?: unknown;
  accountRole?: unknown;
  phone?: unknown;
  privacyAgreed?: unknown;
  termsAgreed?: unknown;
  ageConfirmed?: unknown;
  next?: unknown;
};

export async function POST(request: NextRequest) {
  let body: GoogleAuthBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Google 인증 요청을 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const mode = body.mode === "signup" ? "signup" : "signin";
  const rateLimit = await consumeAuthRateLimit(
    request,
    mode === "signup" ? "signup" : "authenticate",
  );
  if (!rateLimit.allowed) {
    return authRateLimitResponse(rateLimit.retryAfterSeconds);
  }

  if (mode === "signup") {
    return NextResponse.json(
      {
        error: "Google 신규 가입은 지원하지 않습니다. 이메일 회원가입을 이용해 주세요.",
      },
      { status: 400 },
    );
  }

  const callbackUrl = new URL("/api/auth/callback", request.nextUrl.origin);
  callbackUrl.searchParams.set("next", safeInternalDestination(body.next));
  callbackUrl.searchParams.set("provider", "google");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      skipBrowserRedirect: true,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error || !data.url) {
    return NextResponse.json(
      {
        error:
          "Google 인증을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 502 },
    );
  }

  const response = NextResponse.json(
    { url: data.url },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );

  try {
    response.cookies.set(
      GOOGLE_LOGIN_ATTEMPT_COOKIE,
      createGoogleLoginAttempt(),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: GOOGLE_LOGIN_ATTEMPT_MAX_AGE,
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Google 로그인 확인 기능이 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  return response;
}
