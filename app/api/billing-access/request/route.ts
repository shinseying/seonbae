import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { createOtpClient } from "../../../../utils/auth/otp-client";
import {
  createChallenge,
  type BillingChallenge,
} from "../../../../utils/auth/portal-otp";
import {
  authRateLimitResponse,
  consumeAuthRateLimit,
} from "../../../../utils/auth/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "recovery");
  if (!rateLimit.allowed) return authRateLimitResponse(rateLimit.retryAfterSeconds);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,email,phone")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "parent") return errorResponse("보호자 계정만 이용할 수 있습니다.", 403);

  const body = await request.json().catch(() => ({}));
  const method = body.method === "phone" ? "phone" : "email";
  // Phone OTP is switched off until SMS delivery is provisioned; the UI
  // disables the option and this rejects anything that gets past it.
  if (body.method === "phone") return errorResponse("휴대전화 인증은 아직 지원하지 않습니다. 이메일 인증을 사용해 주세요.", 501);
  const target = method === "phone" ? profile.phone || user.phone : profile.email || user.email;
  if (!target) {
    return errorResponse(
      method === "phone"
        ? "계정에 등록된 휴대전화번호가 없습니다. 이메일 인증을 이용해 주세요."
        : "계정에 등록된 이메일이 없습니다. 휴대전화 인증을 이용해 주세요.",
      400,
    );
  }

  const challenge = createChallenge<Omit<BillingChallenge, "issuedAt" | "expiresAt">>({
    kind: "billing-challenge",
    userId: user.id,
    method,
  });

  const otp = createOtpClient();
  const redirectTo = `${request.nextUrl.origin}/portal/billing/confirm?challenge=${encodeURIComponent(challenge)}`;
  const result = method === "phone"
    ? await otp.auth.signInWithOtp({
        phone: target,
        options: { shouldCreateUser: false, channel: "sms" },
      })
    : await otp.auth.signInWithOtp({
        email: target,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      });

  if (result.error) {
    console.error("Billing OTP request failed", {
      method,
      code: result.error.code,
      message: result.error.message,
    });
    return errorResponse("인증 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  }

  return NextResponse.json(
    {
      challenge,
      method,
      destination: maskDestination(target, method),
      message:
        method === "phone"
          ? "등록된 휴대전화로 인증번호를 보냈습니다."
          : "등록된 이메일로 인증번호와 일회용 링크를 보냈습니다.",
    },
    { headers: noStoreHeaders() },
  );
}

function maskDestination(value: string, method: "email" | "phone") {
  if (method === "phone") return `•••• ${value.replace(/\D/g, "").slice(-4)}`;
  const [name, domain] = value.split("@");
  return `${name.slice(0, 2)}•••@${domain}`;
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStoreHeaders() });
}

function noStoreHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
}
