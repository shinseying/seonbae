import { NextRequest, NextResponse } from "next/server";
import { sendAdmissionsAccountReviewEmail } from "../../../utils/email/admissions";
import { normalizePhone } from "../../../utils/auth/phone";
import { isEmailAddress, isKoreanSchoolEmail } from "../../../utils/auth/school-email";
import { authRateLimitResponse, consumeAuthRateLimit } from "../../../utils/auth/rate-limit";
import { createAdminClient } from "../../../utils/supabase/admin";
import { signApplicationId, verifyApplicationToken } from "../../../utils/auth/application-handle";

export const dynamic = "force-dynamic";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

// Tutor applications arrive before any account exists. Nothing here creates a
// login: an admin reviews the request and provisions the account afterwards.
export async function POST(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "signup");
  if (!rateLimit.allowed) return authRateLimitResponse(rateLimit.retryAfterSeconds);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("지원서를 다시 확인해 주세요.", 400);
  }

  const fullName = text(form, "fullName", 80);
  const email = text(form, "email", 254).toLowerCase();
  const phone = normalizePhone(text(form, "phone", 24));
  const university = text(form, "university", 80);
  const curriculum = text(form, "curriculum", 60);
  const languages = text(form, "languages", 80);
  const lessonFormat = text(form, "lessonFormat", 80);

  // One row per subject: name, score, and the proof for that subject. The
  // three lists come back from FormData in the order the rows were filled.
  const subjectNames = form.getAll("subjectName");
  const subjectScoreValues = form.getAll("subjectScore");
  const subjectProofs = form.getAll("subjectProof");
  const subjects = subjectNames
    .map((value) => (typeof value === "string" ? value.trim().slice(0, 80) : ""))
    .filter(Boolean)
    .join(", ")
    .slice(0, 300);
  const introduction = text(form, "introduction", 2000);
  const note = [
    text(form, "major", 120) && `전공/학년: ${text(form, "major", 120)}`,
    curriculum && `지원 커리큘럼: ${curriculum}`,
    languages && `수업 가능 언어: ${languages}`,
    lessonFormat && `수업 형식: ${lessonFormat}`,
    introduction && `소개: ${introduction}`,
  ].filter(Boolean).join("\n");

  const acceptanceLetter = form.get("acceptanceLetter");

  if (fullName.length < 2 || !isEmailAddress(email)) {
    return error("이름과 이메일 주소를 확인해 주세요.", 400);
  }
  if (!isKoreanSchoolEmail(email)) {
    return error("튜터 지원은 .ac.kr로 끝나는 학교 이메일로만 접수됩니다.", 400);
  }
  if (!phone) return error("휴대전화 번호를 국가 번호와 함께 입력해 주세요.", 400);
  if (!university) return error("대학교를 선택해 주세요.", 400);
  if (!languages || !lessonFormat) return error("수업 가능 언어와 수업 형식을 입력해 주세요.", 400);

  const letterError = documentError(acceptanceLetter, "학교 합격통지서", true);
  if (letterError) return error(letterError, 400);

  // Every subject the applicant wants to teach needs a score and its proof.
  if (!subjectNames.length) return error("가르칠 과목을 최소 하나 입력해 주세요.", 400);
  if (subjectScoreValues.length !== subjectNames.length || subjectProofs.length !== subjectNames.length) {
    return error("과목별 성적과 증빙을 모두 채워 주세요.", 400);
  }

  const subjectRows = subjectNames.map((value, index) => ({
    subject: typeof value === "string" ? value.trim().slice(0, 80) : "",
    score: typeof subjectScoreValues[index] === "string"
      ? (subjectScoreValues[index] as string).trim().slice(0, 24)
      : "",
    proof: subjectProofs[index],
  }));

  for (const row of subjectRows) {
    if (!row.subject || !row.score) {
      return error("과목별 성적을 모두 채워 주세요.", 400);
    }
    const proofError = documentError(row.proof, `${row.subject} 증빙`, true);
    if (proofError) return error(proofError, 400);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("지원 시스템이 아직 설정되지 않았습니다. 입학팀에 문의해 주세요.", 503);
  }

  const folder = `applications/${crypto.randomUUID()}`;
  const letter = acceptanceLetter as File;
  const letterName = safeFileName(letter.name);
  const letterPath = `${folder}/letter-${letterName}`;

  // Each subject keeps its proof next to its score, so a reviewer opening
  // the application never has to guess which file backs which grade.
  const subjectScores = subjectRows.map((row, index) => {
    const file = row.proof as File;
    const proofName = safeFileName(file.name);
    return {
      subject: row.subject,
      score: row.score,
      proofName,
      proofPath: `${folder}/subject-${index + 1}-${proofName}`,
      file,
    };
  });

  const uploads: Array<[string, File]> = [
    [letterPath, letter],
    ...subjectScores.map((row) => [row.proofPath, row.file] as [string, File]),
  ];
  for (const [path, file] of uploads) {
    const { error: uploadError } = await admin.storage
      .from("account-documents")
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (uploadError) return error("서류를 업로드하지 못했습니다. 다시 시도해 주세요.", 500);
  }

  const { data, error: insertError } = await admin
    .from("account_creation_requests")
    .insert({
      user_id: null,
      full_name: fullName,
      email,
      phone,
      requested_role: "tutor",
      acceptance_letter_path: letterPath,
      acceptance_letter_name: letterName,
      university,
      subjects,
      curriculum: curriculum || null,
      subject_scores: subjectScores.map(({ subject, score, proofName, proofPath }) => ({
        subject,
        score,
        proofName,
        proofPath,
      })),
      languages,
      lesson_format: lessonFormat,
      introduction: introduction || null,
      applicant_note: note || null,
    })
    .select("id")
    .single();

  if (insertError || !data) {
    return error("지원서를 저장하지 못했습니다. 다시 시도해 주세요.", 500);
  }

  const { data: signed } = await admin.storage
    .from("account-documents")
    .createSignedUrl(letterPath, 60 * 60 * 24 * 7);

  try {
    await sendAdmissionsAccountReviewEmail({
      requestId: data.id,
      fullName,
      email,
      phone,
      role: "tutor",
      letterName,
      letterUrl: signed?.signedUrl,
    });
    await admin
      .from("account_creation_requests")
      .update({ notification_sent_at: new Date().toISOString() })
      .eq("id", data.id);
  } catch (sendError) {
    // The application is already stored; a failed notification is recorded for
    // the admin queue rather than shown to the applicant.
    await admin
      .from("account_creation_requests")
      .update({ notification_error: String(sendError).slice(0, 500) })
      .eq("id", data.id);
  }

  // The thank-you page uses these to attach the "how did you hear about us"
  // answer to this row, and nothing else.
  return NextResponse.json({ ok: true, id: data.id, token: signApplicationId(data.id) });
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

function documentError(value: FormDataEntryValue | null, label: string, required: boolean) {
  if (!(value instanceof File) || value.size === 0) {
    return required ? `${label}를 첨부해 주세요.` : null;
  }
  if (value.size > MAX_DOCUMENT_BYTES || !ALLOWED_DOCUMENT_TYPES.has(value.type)) {
    return `${label}는 10MB 이하 PDF, JPG 또는 PNG만 제출할 수 있습니다.`;
  }
  return null;
}

function text(form: FormData, key: string, max: number) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeFileName(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return cleaned || "document";
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
