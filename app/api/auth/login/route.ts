import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../../utils/supabase/server";
import {
  ADMIN_AUTH_EMAIL,
  decodeJwtClaims,
  INVALID_LOGIN_MESSAGE,
  loginMethodMatchesRole,
  sessionBindingFromClaims,
} from "../../../../utils/auth/access-gate";
import {
  clearAccessGateCookies,
  issueUserChallenge,
} from "../../../../utils/auth/step-up-server";
import {
  authRateLimitResponse,
  consumeAuthRateLimit,
} from "../../../../utils/auth/rate-limit";

export const dynamic = "force-dynamic";

const adminLoginId = "ssapgoadmin";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "authenticate");
  if (!rateLimit.allowed) {
    return authRateLimitResponse(rateLimit.retryAfterSeconds);
  }

  let body: { identifier?: unknown; password?: unknown; remember?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "로그인 정보를 다시 확인해 주세요." }, { status: 400 });
  }

  const identifier =
    typeof body.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const remember = body.remember === true;
  const isAdminLogin = identifier === adminLoginId;
  const email = isAdminLogin ? ADMIN_AUTH_EMAIL : identifier;

  if (!identifier || !password || (!isAdminLogin && !isEmail(email))) {
    return invalidCredentials();
  }

  const supabase = await createClient({ remember });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return invalidCredentials();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status")
    .eq("id", data.user.id)
    .single();

  if (!loginMethodMatchesRole(isAdminLogin, profile?.role)) {
    // Only discard the session created by this request. A mistaken login must
    // never revoke the administrator's sessions on other browsers or devices.
    await supabase.auth.signOut({ scope: "local" });
    return invalidCredentials();
  }

  const cookieStore = await cookies();
  const rememberOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: 400 * 24 * 60 * 60 } : {}),
  };
  clearAccessGateCookies(cookieStore);
  cookieStore.set("seonbae-remember", remember ? "1" : "0", rememberOptions);

  if (profile?.role === "admin") {
    return NextResponse.json({
      destination: "/admin-verify",
      secondStepRequired: true,
    });
  }

  const claims = decodeJwtClaims(data.session?.access_token);
  const sessionId = sessionBindingFromClaims(claims);
  if (!sessionId || !data.user.email) {
    await supabase.auth.signOut({ scope: "local" });
    clearAccessGateCookies(cookieStore);
    return NextResponse.json(
      { error: "로그인 보안 세션을 만들지 못했습니다. 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  try {
    await issueUserChallenge({
      userId: data.user.id,
      email: data.user.email,
      sessionId,
      remember,
    });
  } catch (error) {
    console.error("Login verification email failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    await supabase.auth.signOut({ scope: "local" });
    clearAccessGateCookies(cookieStore);
    return NextResponse.json(
      { error: "로그인 인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    destination: "/login/verify",
    secondStepRequired: true,
  });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function invalidCredentials() {
  return NextResponse.json(
    { error: INVALID_LOGIN_MESSAGE },
    {
      status: 401,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}
