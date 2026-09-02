import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "../../../../utils/supabase/server";
import {
  GOOGLE_LOGIN_ATTEMPT_COOKIE,
  readGoogleLoginAttempt,
} from "../../../../utils/auth/google-login-attempt";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { TUTOR_CONTRACT_VERSION } from "../../../../utils/contracts/tutor-contract";
import {
  decodeJwtClaims,
  sessionBindingFromClaims,
} from "../../../../utils/auth/access-gate";
import {
  clearAccessGateCookies,
  issueUserChallenge,
} from "../../../../utils/auth/step-up-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = emailOtpType(request.nextUrl.searchParams.get("type"));
  const next = safeDestination(request.nextUrl.searchParams.get("next"));
  const provider = request.nextUrl.searchParams.get("provider");
  const supabase = await createClient();
  let verified = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    verified = !error;
  }

  if (verified) {
    const cookieStore = await cookies();
    if (provider === "google") {
      const googleCheck = await checkExistingGoogleAccount(
        supabase,
        cookieStore.get(GOOGLE_LOGIN_ATTEMPT_COOKIE)?.value,
      );
      cookieStore.delete(GOOGLE_LOGIN_ATTEMPT_COOKIE);

      if (!googleCheck.allowed) {
        return NextResponse.redirect(
          new URL(`/login?error=${googleCheck.error}`, request.nextUrl.origin),
        );
      }

      const [{ data: sessionData }, { data: userData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);
      const session = sessionData.session;
      const user = userData.user;
      const sessionId = sessionBindingFromClaims(decodeJwtClaims(session?.access_token));
      if (!user?.email || !sessionId) {
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.redirect(
          new URL("/login?error=verification-email-unavailable", request.nextUrl.origin),
        );
      }
      clearAccessGateCookies(cookieStore);
      cookieStore.set("seonbae-remember", "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 400 * 24 * 60 * 60,
      });

      if (googleCheck.profile.role === "admin") {
        return NextResponse.redirect(new URL("/admin-verify", request.nextUrl.origin));
      }

      try {
        await issueUserChallenge({
          userId: user.id,
          email: user.email,
          sessionId,
          remember: true,
        });
      } catch (error) {
        console.error("Google login verification email failed", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
        await supabase.auth.signOut({ scope: "local" });
        clearAccessGateCookies(cookieStore);
        return NextResponse.redirect(
          new URL("/login?error=verification-email-unavailable", request.nextUrl.origin),
        );
      }
      return NextResponse.redirect(
        new URL("/login/verify", request.nextUrl.origin),
      );
    }

    cookieStore.set("seonbae-remember", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 400 * 24 * 60 * 60,
    });

    return NextResponse.redirect(new URL(next, request.nextUrl.origin));
  }

  return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
}

async function checkExistingGoogleAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attemptToken: string | undefined,
) {
  const attempt = readGoogleLoginAttempt(attemptToken);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!attempt || !user?.email) {
    await supabase.auth.signOut({ scope: "local" });
    return { allowed: false as const, error: "google-check-expired" };
  }

  try {
    const admin = createAdminClient();
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id,email,role,account_status,created_at")
      .ilike("email", user.email)
      .order("created_at", { ascending: true })
      .limit(5);

    if (error) throw error;
    const matchingProfile = (profiles ?? []).find(
      (profile) => profile.id === user.id,
    );
    const profileCreatedAt = matchingProfile?.created_at
      ? Date.parse(matchingProfile.created_at)
      : Number.NaN;
    const existedBeforeGoogle =
      Boolean(matchingProfile)
      && Number.isFinite(profileCreatedAt)
      && profileCreatedAt <= attempt.issuedAt;

    if (existedBeforeGoogle) {
      let contractSigned = true;
      if (matchingProfile!.role === "tutor" && matchingProfile!.account_status === "pending") {
        const { data: signature, error: signatureError } = await admin
          .from("tutor_contract_signatures")
          .select("id")
          .eq("tutor_id", matchingProfile!.id)
          .eq("contract_version", TUTOR_CONTRACT_VERSION)
          .maybeSingle();
        contractSigned = !signatureError && Boolean(signature);
      }
      return {
        allowed: true as const,
        profile: {
          role: matchingProfile!.role,
          accountStatus: matchingProfile!.account_status,
          contractSigned,
        },
      };
    }

    const userCreatedAt = Date.parse(user.created_at);
    await supabase.auth.signOut({ scope: "local" });

    // Supabase may have created a new auth user and profile during OAuth. Only
    // remove it when both timestamps prove it belongs to this login attempt;
    // an older account is never deleted merely because its profile is missing.
    if (Number.isFinite(userCreatedAt) && userCreatedAt >= attempt.issuedAt) {
      await admin.auth.admin.deleteUser(user.id);
    }

    return { allowed: false as const, error: "google-account-not-found" };
  } catch (error) {
    console.error("Google account pre-existence check failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    await supabase.auth.signOut({ scope: "local" });
    return { allowed: false as const, error: "google-check-unavailable" };
  }
}

function emailOtpType(value: string | null): EmailOtpType | null {
  const allowedTypes: EmailOtpType[] = [
    "email",
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email_change",
  ];

  return value && allowedTypes.includes(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

function safeDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/portal";
  }
  return value;
}
