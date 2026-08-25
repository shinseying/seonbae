import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sendAdmissionsAccountReviewEmail } from "../../../../utils/email/admissions";
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../../../../utils/auth/legal";
import { getPasswordPolicyError } from "../../../../utils/auth/password";
import { normalizePhone } from "../../../../utils/auth/phone";
import { isEmailAddress, isKoreanSchoolEmail } from "../../../../utils/auth/school-email";
import { authRateLimitResponse, consumeAuthRateLimit } from "../../../../utils/auth/rate-limit";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
type AccountRole = "student" | "parent" | "tutor";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "signup");
  if (!rateLimit.allowed) return authRateLimitResponse(rateLimit.retryAfterSeconds);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("가입 정보를 다시 확인해 주세요.", 400);
  }

  const fullName = formText(form, "fullName").slice(0, 80);
  const email = formText(form, "email").toLowerCase();
  const phone = normalizePhone(formText(form, "phone"));
  const password = formText(form, "password");
  const accountRole = parseRole(formText(form, "accountRole"));
  const isTutor = accountRole === "tutor";
  const referralCode = isTutor ? formText(form, "referralCode").replace(/\s+/g, " ").slice(0, 80) : "";
  const privacyAgreed = formText(form, "privacyAgreed") === "true";
  const termsAgreed = formText(form, "termsAgreed") === "true";
  const ageConfirmed = formText(form, "ageConfirmed") === "true";
  const acceptanceLetter = form.get("acceptanceLetter");
  const passwordError = getPasswordPolicyError(password);

  if (fullName.length < 2 || !isEmailAddress(email)) {
    return jsonError("이름과 이메일 주소를 확인해 주세요.", 400);
  }
  if (isTutor && !isKoreanSchoolEmail(email)) {
    return jsonError("튜터는 .ac.kr로 끝나는 학교 이메일을 사용해야 합니다.", 400);
  }
  if (!phone) return jsonError("휴대전화 번호를 국가 번호와 함께 입력해 주세요.", 400);
  if (passwordError) return jsonError(passwordError, 400);
  if (!privacyAgreed || !termsAgreed || !ageConfirmed) {
    return jsonError("회원가입에 필요한 필수 약관에 모두 동의해 주세요.", 400);
  }
  if (isTutor && (!(acceptanceLetter instanceof File) || acceptanceLetter.size === 0)) {
    return jsonError("학적증명서를 첨부해 주세요.", 400);
  }
  if (
    isTutor
    && acceptanceLetter instanceof File
    && (acceptanceLetter.size > MAX_DOCUMENT_BYTES || !ALLOWED_DOCUMENT_TYPES.has(acceptanceLetter.type))
  ) {
    return jsonError("학적증명서는 10MB 이하 PDF, JPG 또는 PNG만 제출할 수 있습니다.", 400);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("회원가입 시스템이 아직 설정되지 않았습니다. 입학팀에 문의해 주세요.", 503);
  }

  const { data: existingPhone, error: phoneLookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();

  if (phoneLookupError) return jsonError("휴대전화 번호 중복 여부를 확인하지 못했습니다.", 503);
  // One message for every taken field: naming which one lets an address or a
  // number be probed for on its own.
  if (existingPhone) return jsonError("해당 정보로 가입된 계정이 존재합니다.", 409);

  // Supabase hides whether an address is taken, so the check happens here and
  // the applicant is told plainly rather than seeing a generic failure.
  const { data: existingEmail } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (existingEmail) return jsonError("해당 정보로 가입된 계정이 존재합니다.", 409);

  const supabase = await createClient();
  const confirmationDestination = "/signup/thank-you";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone,
        account_role: accountRole,
        privacy_agreed: true,
        privacy_consent_version: PRIVACY_POLICY_VERSION,
        terms_agreed: true,
        terms_version: TERMS_VERSION,
        age_confirmed: true,
      },
      emailRedirectTo: `${request.nextUrl.origin}/api/auth/callback?next=${confirmationDestination}`,
    },
  });

  if (error || !data.user) return signupError(error?.message);
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    await supabase.auth.signOut();
    return signupError("already registered");
  }

  // Only tutors need an admin review. Students and parents self-serve: their
  // account is approved on creation so they reach the portal after verifying
  // their email, without an admissions gate.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      phone,
      role: accountRole,
      account_status: isTutor ? "pending" : "approved",
      account_reviewed_at: isTutor ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.user.id);

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return jsonError(
      profileError.code === "23505"
        ? "해당 정보로 가입된 계정이 존재합니다."
        : "계정 정보를 저장하지 못했습니다. 다시 시도해 주세요.",
      profileError.code === "23505" ? 409 : 500,
    );
  }

  let documentPath: string | null = null;
  let documentName: string | null = null;
  if (isTutor && acceptanceLetter instanceof File) {
    documentName = safeFileName(acceptanceLetter.name);
    documentPath = `${data.user.id}/${Date.now()}-${documentName}`;
    const { error: uploadError } = await admin.storage
      .from("account-documents")
      .upload(documentPath, await acceptanceLetter.arrayBuffer(), {
        contentType: acceptanceLetter.type,
        upsert: false,
      });

    if (uploadError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return jsonError("학적증명서를 안전하게 저장하지 못했습니다. 다시 시도해 주세요.", 500);
    }
  }

  // Admissions review record + email are tutor-only. Self-serve accounts skip
  // the whole admin-review pipeline.
  let notificationError: string | null = null;
  if (isTutor) {
    const { data: application, error: applicationError } = await admin
      .from("account_creation_requests")
      .insert({
        user_id: data.user.id,
        full_name: fullName,
        email,
        phone,
        requested_role: accountRole,
        acceptance_letter_path: documentPath,
        acceptance_letter_name: documentName,
        referral_code: referralCode || null,
      })
      .select("id")
      .single();

    if (applicationError || !application) {
      if (documentPath) await admin.storage.from("account-documents").remove([documentPath]);
      await admin.auth.admin.deleteUser(data.user.id);
      return jsonError("가입 심사 요청을 저장하지 못했습니다. 다시 시도해 주세요.", 500);
    }

    try {
      let documentUrl: string | undefined;
      if (documentPath) {
        const { data: signed, error: signedError } = await admin.storage
          .from("account-documents")
          .createSignedUrl(documentPath, 7 * 24 * 60 * 60);
        if (signedError || !signed?.signedUrl) throw signedError || new Error("No document URL");
        documentUrl = signed.signedUrl;
      }

      await sendAdmissionsAccountReviewEmail({
        requestId: application.id,
        fullName,
        email,
        phone,
        role: accountRole,
        letterName: documentName || undefined,
        letterUrl: documentUrl,
      });
    } catch (mailError) {
      notificationError = mailError instanceof Error ? mailError.message.slice(0, 500) : "Email failed";
    }

    const updatedAt = new Date().toISOString();
    await admin
      .from("account_creation_requests")
      .update(notificationError
        ? { notification_error: notificationError, updated_at: updatedAt }
        : { notification_sent_at: updatedAt, notification_error: null, updated_at: updatedAt })
      .eq("id", application.id);
  }

  await setRememberCookie(Boolean(data.session));
  const destination = data.session
    ? confirmationDestination
    : `/signup/verify-email?email=${encodeURIComponent(email)}`;

  return NextResponse.json({
    destination,
    message: data.session
      ? isTutor
        ? "가입 심사 요청이 접수되었습니다."
        : "가입이 완료되었습니다."
      : "인증 이메일을 보냈습니다.",
    reviewPending: isTutor,
    notificationQueued: Boolean(notificationError),
  });
}

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseRole(value: string): AccountRole {
  return value === "parent" || value === "tutor" ? value : "student";
}

function safeFileName(value: string) {
  const clean = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.slice(0, 120) || "acceptance-letter";
}

async function setRememberCookie(hasSession: boolean) {
  if (!hasSession) return;
  const cookieStore = await cookies();
  cookieStore.set("seonbae-remember", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 400 * 24 * 60 * 60,
  });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function signupError(message = "") {
  const normalized = message.toLowerCase();
  const duplicate = normalized.includes("already") || normalized.includes("registered") || normalized.includes("exists");
  const rateLimited = normalized.includes("rate limit");
  return jsonError(
    duplicate
      ? "해당 정보로 가입된 계정이 존재합니다."
      : rateLimited
        ? "가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
        : "가입 요청을 완료하지 못했습니다. 입력한 정보를 다시 확인해 주세요.",
    rateLimited ? 429 : 400,
  );
}
