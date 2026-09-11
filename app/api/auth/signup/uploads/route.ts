import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "../../../../../utils/auth/phone";
import { authRateLimitResponse, consumeAuthRateLimit } from "../../../../../utils/auth/rate-limit";
import { isEmailAddress, isKoreanSchoolEmail } from "../../../../../utils/auth/school-email";
import {
  issueTutorUploadTicket,
  normalizeTutorUploadDocuments,
  readTutorUploadTicket,
  TUTOR_UPLOAD_BUCKET,
} from "../../../../../utils/auth/tutor-upload-ticket";
import {
  cancelTutorUploadBatch,
  cleanupExpiredTutorUploadBatches,
  registerTutorUploadBatch,
} from "../../../../../utils/auth/tutor-upload-batch";
import { createAdminClient } from "../../../../../utils/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "signup");
  if (!rateLimit.allowed) return authRateLimitResponse(rateLimit.retryAfterSeconds);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64 * 1024) return jsonError("업로드 준비 요청이 너무 큽니다.", 413);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("첨부할 서류 정보를 다시 확인해 주세요.", 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
  const documents = normalizeTutorUploadDocuments(body.documents);
  if (!isEmailAddress(email) || !isKoreanSchoolEmail(email) || !phone || !documents) {
    return jsonError("튜터 이메일, 연락처와 첨부 파일 정보를 다시 확인해 주세요.", 400);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("튜터 서류 업로드 시스템이 아직 설정되지 않았습니다.", 503);
  }

  // Keep abandoned uploads bounded even when the daily cleanup has not run.
  // A small limit keeps signup latency predictable.
  await cleanupExpiredTutorUploadBatches(admin, 3);

  const [{ data: existingPhone, error: phoneError }, { data: existingEmail, error: emailError }] = await Promise.all([
    admin.from("profiles").select("id").eq("phone", phone).limit(1).maybeSingle(),
    admin.from("profiles").select("id").ilike("email", email).limit(1).maybeSingle(),
  ]);
  if (phoneError || emailError) return jsonError("가입 정보 중복 여부를 확인하지 못했습니다.", 503);
  if (existingPhone || existingEmail) return jsonError("해당 정보로 가입된 계정이 존재합니다.", 409);

  let issued: ReturnType<typeof issueTutorUploadTicket>;
  try {
    issued = issueTutorUploadTicket(email, phone, documents);
  } catch {
    return jsonError("튜터 서류 업로드를 준비하지 못했습니다.", 503);
  }
  if (!(await registerTutorUploadBatch(admin, issued.payload))) {
    return jsonError("튜터 서류 업로드를 준비하지 못했습니다. 다시 시도해 주세요.", 503);
  }

  const signedUploads = await Promise.all(issued.payload.documents.map(async (document) => {
    const { data, error } = await admin.storage
      .from(TUTOR_UPLOAD_BUCKET)
      .createSignedUploadUrl(document.storagePath, { upsert: false });
    return error || !data?.token
      ? null
      : { path: document.storagePath, token: data.token };
  }));
  if (signedUploads.some((upload) => !upload)) {
    await cancelTutorUploadBatch(admin, issued.payload);
    return jsonError("튜터 서류 업로드를 준비하지 못했습니다. 다시 시도해 주세요.", 503);
  }

  return NextResponse.json(
    { ticket: issued.ticket, uploads: signedUploads },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function DELETE(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 24 * 1024) return jsonError("정리 요청이 너무 큽니다.", 413);

  let ticketValue = "";
  try {
    const body = await request.json();
    ticketValue = typeof body?.ticket === "string" ? body.ticket : "";
  } catch {
    return jsonError("업로드 정리 요청을 확인하지 못했습니다.", 400);
  }
  const ticket = readTutorUploadTicket(ticketValue, Date.now(), 24 * 60 * 60);
  if (!ticket) return jsonError("업로드 정리 요청이 만료되었거나 올바르지 않습니다.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("업로드 파일을 정리하지 못했습니다.", 503);
  }
  const cleaned = await cancelTutorUploadBatch(admin, ticket);
  return cleaned
    ? NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
    : jsonError("업로드 파일을 정리하지 못했습니다.", 503);
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
