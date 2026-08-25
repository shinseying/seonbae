import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createOtpClient } from "../../../../utils/auth/otp-client";
import { normalizePhone } from "../../../../utils/auth/phone";
import {
  createChallenge,
  type FamilyLinkChallenge,
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

  const { data: parent } = await supabase
    .from("profiles")
    .select("role,account_status")
    .eq("id", user.id)
    .single();
  if (parent?.role !== "parent" || parent.account_status !== "approved") return errorResponse("승인된 보호자 계정만 이용할 수 있습니다.", 403);

  const body = await request.json().catch(() => ({}));
  const method = body.method === "phone" ? "phone" : "email";
  // Phone OTP is switched off until SMS delivery is provisioned; the UI
  // disables the option and this rejects anything that gets past it.
  if (body.method === "phone") return errorResponse("휴대전화 인증은 아직 지원하지 않습니다. 이메일 인증을 사용해 주세요.", 501);
  const rawTarget = typeof body.target === "string" ? body.target.trim() : "";
  const target = method === "phone" ? normalizePhone(rawTarget) : rawTarget.toLowerCase();
  if (!target || (method === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))) {
    return errorResponse("학생의 이메일 또는 휴대전화번호를 올바르게 입력해 주세요.", 400);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return errorResponse("학생 연결 서비스를 사용할 수 없습니다.", 503);
  }

  const query = admin
    .from("profiles")
    .select("id,email,phone,role,account_status")
    .eq("role", "student")
    .eq("account_status", "approved")
    .eq(method === "phone" ? "phone" : "email", target)
    .order("created_at", { ascending: true })
    .limit(1);
  const { data: students } = await query;
  const student = students?.[0] ?? null;
  const studentId = student?.id || randomUUID();
  const challenge = createChallenge<Omit<FamilyLinkChallenge, "issuedAt" | "expiresAt">>({
    kind: "family-link",
    parentId: user.id,
    studentId,
    method,
  });

  if (student) {
    const otp = createOtpClient();
    const deliveryTarget = method === "phone" ? student.phone : student.email;
    const redirectTo = `${request.nextUrl.origin}/portal/family/confirm?challenge=${encodeURIComponent(challenge)}`;
    const result = method === "phone"
      ? await otp.auth.signInWithOtp({
          phone: deliveryTarget,
          options: { shouldCreateUser: false, channel: "sms" },
        })
      : await otp.auth.signInWithOtp({
          email: deliveryTarget,
          options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
        });
    if (result.error) {
      console.error("Family-link OTP request failed", {
        method,
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  return NextResponse.json(
    {
      challenge,
      method,
      message:
        method === "phone"
          ? "일치하는 학생 계정이 있으면 등록된 휴대전화로 인증번호를 보냈습니다."
          : "일치하는 학생 계정이 있으면 등록된 이메일로 인증번호와 승인 링크를 보냈습니다.",
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
