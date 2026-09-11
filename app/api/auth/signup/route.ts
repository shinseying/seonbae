import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sendAdmissionsAccountReviewEmail } from "../../../../utils/email/admissions";
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../../../../utils/auth/legal";
import { getPasswordPolicyError } from "../../../../utils/auth/password";
import { normalizePhone } from "../../../../utils/auth/phone";
import { isEmailAddress, isKoreanSchoolEmail } from "../../../../utils/auth/school-email";
import {
  tutorSignupDetailsFromForm,
  tutorSignupErrorKo,
  validateTutorSignupDetails,
} from "../../../../utils/auth/tutor-signup";
import {
  readTutorUploadTicket,
  tutorUploadTicketMatches,
} from "../../../../utils/auth/tutor-upload-ticket";
import {
  validateUploadedTutorDocuments,
} from "../../../../utils/auth/tutor-upload-storage";
import {
  attachTutorUploadUser,
  claimTutorUploadBatch,
  completeTutorUploadBatch,
  failTutorUploadBatch,
} from "../../../../utils/auth/tutor-upload-batch";
import { authRateLimitResponse, consumeAuthRateLimit } from "../../../../utils/auth/rate-limit";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FINAL_SIGNUP_BYTES = 256 * 1024;

type AccountRole = "student" | "parent" | "tutor";

type UploadedAccountDocument = {
  kind: "school_proof" | "credential";
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
};

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_FINAL_SIGNUP_BYTES) {
    return jsonError("가입 요청이 너무 큽니다. 첨부 파일을 다시 업로드해 주세요.", 413);
  }

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
  const tutorDetails = isTutor ? tutorSignupDetailsFromForm(form) : null;
  const referralCode = isTutor ? formText(form, "referralCode").replace(/\s+/g, " ").slice(0, 80) : "";
  const privacyAgreed = formText(form, "privacyAgreed") === "true";
  const termsAgreed = formText(form, "termsAgreed") === "true";
  const ageConfirmed = formText(form, "ageConfirmed") === "true";
  const passwordError = getPasswordPolicyError(password);
  const tutorTicket = isTutor
    ? readTutorUploadTicket(formText(form, "uploadTicket"))
    : null;

  // The upload-preparation request already consumes the signup limit for a
  // tutor. Requiring the signed, identity-bound ticket here avoids charging a
  // second attempt merely because the documents bypassed Vercel's body limit.
  if (isTutor && (
    !tutorTicket
    || !phone
    || !tutorUploadTicketMatches(tutorTicket, email, phone)
  )) {
    return jsonError("튜터 서류 업로드 인증이 만료되었거나 가입 정보와 일치하지 않습니다.", 400);
  }
  if (!isTutor) {
    const rateLimit = await consumeAuthRateLimit(request, "signup");
    if (!rateLimit.allowed) return authRateLimitResponse(rateLimit.retryAfterSeconds);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("회원가입 시스템이 아직 설정되지 않았습니다. 입학팀에 문의해 주세요.", 503);
  }

  const finalizationToken = tutorTicket ? randomUUID() : null;
  if (tutorTicket && finalizationToken && !(
    await claimTutorUploadBatch(admin, tutorTicket, finalizationToken)
  )) {
    return jsonError("이 튜터 서류 업로드는 만료되었거나 이미 처리 중입니다.", 409);
  }

  const failTutorSignup = async (error: string, status: number) => {
    if (tutorTicket && finalizationToken) {
      await failTutorUploadBatch(admin, tutorTicket, finalizationToken);
    }
    return jsonError(error, status);
  };

  if ([...form.values()].some((value) => typeof value !== "string")) {
    return failTutorSignup("첨부 파일은 안전한 직접 업로드 절차로 다시 제출해 주세요.", 400);
  }

  if (fullName.length < 2 || !isEmailAddress(email)) {
    return failTutorSignup("이름과 이메일 주소를 확인해 주세요.", 400);
  }
  if (isTutor && !isKoreanSchoolEmail(email)) {
    return failTutorSignup("튜터는 .ac.kr로 끝나는 학교 이메일을 사용해야 합니다.", 400);
  }
  if (!phone) return failTutorSignup("휴대전화 번호를 국가 번호와 함께 입력해 주세요.", 400);
  if (passwordError) return failTutorSignup(passwordError, 400);
  if (!privacyAgreed || !termsAgreed || !ageConfirmed) {
    return failTutorSignup("회원가입에 필요한 필수 약관에 모두 동의해 주세요.", 400);
  }
  if (isTutor) {
    if (!tutorDetails) return failTutorSignup("튜터 지원 정보를 다시 확인해 주세요.", 400);
    const detailError = validateTutorSignupDetails(tutorDetails);
    if (detailError) return failTutorSignup(tutorSignupErrorKo(detailError), 400);
  }

  const [
    { data: existingPhone, error: phoneLookupError },
    { data: existingEmail, error: emailLookupError },
  ] = await Promise.all([
    admin.from("profiles").select("id").eq("phone", phone).limit(1).maybeSingle(),
    admin.from("profiles").select("id").ilike("email", email).limit(1).maybeSingle(),
  ]);
  if (phoneLookupError || emailLookupError) {
    return failTutorSignup("가입 정보 중복 여부를 확인하지 못했습니다.", 503);
  }
  // One message for every taken field: naming which one lets an address or a
  // number be probed for on its own.
  if (existingPhone || existingEmail) {
    return failTutorSignup("해당 정보로 가입된 계정이 존재합니다.", 409);
  }

  if (tutorTicket) {
    const verified = await validateUploadedTutorDocuments(admin, tutorTicket);
    if (verified.error) return failTutorSignup(verified.error, 400);
  }

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

  if (error || !data.user) {
    if (tutorTicket && finalizationToken) {
      await failTutorUploadBatch(admin, tutorTicket, finalizationToken);
    }
    return signupError(error?.message);
  }
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    await supabase.auth.signOut();
    return failTutorSignup("해당 정보로 가입된 계정이 존재합니다.", 409);
  }

  if (tutorTicket && finalizationToken && !(
    await attachTutorUploadUser(admin, tutorTicket.batchId, finalizationToken, data.user.id)
  )) {
    await admin.auth.admin.deleteUser(data.user.id);
    await failTutorUploadBatch(admin, tutorTicket, finalizationToken);
    return jsonError("튜터 서류와 계정을 연결하지 못했습니다. 다시 시도해 주세요.", 500);
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
    if (!isTutor) await admin.auth.admin.deleteUser(data.user.id);
    return failTutorSignup(
      profileError.code === "23505"
        ? "해당 정보로 가입된 계정이 존재합니다."
        : "계정 정보를 저장하지 못했습니다. 다시 시도해 주세요.",
      profileError.code === "23505" ? 409 : 500,
    );
  }

  // Admissions review record + email are tutor-only. Self-serve accounts skip
  // the whole admin-review pipeline.
  let notificationError: string | null = null;
  if (isTutor) {
    if (!tutorTicket || !tutorDetails || !finalizationToken) {
      await admin.auth.admin.deleteUser(data.user.id);
      return failTutorSignup("튜터 지원 정보를 다시 확인해 주세요.", 400);
    }

    // Keep the validated source objects in place. Their retained completed
    // tracker survives until the non-upsert signed URLs expire, so an admin
    // deletion during that window cannot leave an untracked replayed object.
    const uploadedDocuments: UploadedAccountDocument[] = tutorTicket.documents.map((document) => ({
      kind: document.kind,
      storage_path: document.storagePath,
      original_name: document.originalName,
      mime_type: document.mimeType,
      size_bytes: document.sizeBytes,
    }));
    const schoolDocument = uploadedDocuments.find((document) => document.kind === "school_proof")!;
    const firstCredential = uploadedDocuments.find((document) => document.kind === "credential")!;
    const subjects = tutorDetails.subjectScores.map(({ subject }) => subject).join(", ");
    const applicantNote = [
      `전공/학년: ${tutorDetails.majorYear}`,
      `지원 커리큘럼: ${tutorDetails.curriculum}`,
      `수업 가능 언어: ${tutorDetails.languages}`,
      `수업 형식: ${tutorDetails.lessonFormat}`,
      `소개: ${tutorDetails.introduction}`,
    ].join("\n");
    const { data: application, error: applicationError } = await admin
      .from("account_creation_requests")
      .insert({
        user_id: data.user.id,
        full_name: fullName,
        email,
        phone,
        requested_role: accountRole,
        acceptance_letter_path: schoolDocument.storage_path,
        acceptance_letter_name: schoolDocument.original_name,
        credential_path: firstCredential.storage_path,
        credential_name: firstCredential.original_name,
        university: tutorDetails.university,
        major_year: tutorDetails.majorYear,
        subjects,
        curriculum: tutorDetails.curriculum,
        subject_scores: tutorDetails.subjectScores,
        languages: tutorDetails.languages,
        lesson_format: tutorDetails.lessonFormat,
        introduction: tutorDetails.introduction,
        applicant_note: applicantNote,
        referral_code: referralCode || null,
      })
      .select("id")
      .single();

    if (applicationError || !application) {
      await failTutorUploadBatch(admin, tutorTicket, finalizationToken);
      return jsonError("가입 심사 요청을 저장하지 못했습니다. 다시 시도해 주세요.", 500);
    }

    const { error: documentInsertError } = await admin
      .from("account_request_documents")
      .insert(uploadedDocuments.map((document) => ({
        request_id: application.id,
        ...document,
      })));
    if (documentInsertError) {
      await admin.from("account_creation_requests").delete().eq("id", application.id);
      await failTutorUploadBatch(admin, tutorTicket, finalizationToken);
      return jsonError("튜터 심사 서류 기록을 저장하지 못했습니다. 다시 시도해 주세요.", 500);
    }

    if (!(await completeTutorUploadBatch(admin, tutorTicket.batchId, finalizationToken))) {
      // The application and all document references are already durable. An
      // expiry sweep recognizes that durable state and safely completes it.
      console.error("[tutor upload batch] completion acknowledgement deferred", {
        batchId: tutorTicket.batchId,
      });
    }

    try {
      let documentUrl: string | undefined;
      const { data: signed, error: signedError } = await admin.storage
        .from("account-documents")
        .createSignedUrl(schoolDocument.storage_path, 7 * 24 * 60 * 60);
      if (signedError || !signed?.signedUrl) throw signedError || new Error("No document URL");
      documentUrl = signed.signedUrl;

      await sendAdmissionsAccountReviewEmail({
        requestId: application.id,
        fullName,
        email,
        phone,
        role: accountRole,
        letterName: schoolDocument.original_name,
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
