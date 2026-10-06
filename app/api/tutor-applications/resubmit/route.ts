import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { sendAdminEventEmail } from "../../../../utils/email/admin-event";
import {
  documentExtension,
  isDocumentMimeType,
  MAX_DOCUMENT_BYTES,
  type DocumentMimeType,
} from "../../../../utils/files/document-rules";
import { safeOriginalFileName, TUTOR_UPLOAD_BUCKET } from "../../../../utils/auth/tutor-upload-ticket";
import { validateUploadedTutorDocuments } from "../../../../utils/auth/tutor-upload-storage";
import { RESUBMISSION_PREFIX } from "../../../../utils/auth/application-resubmission";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILES = 5;

type RequestedDocument = { originalName: string; mimeType: DocumentMimeType; sizeBytes: number };

// An applicant sent a 보완 요청 (needs_info) uploads documents in two steps,
// like signup: "prepare" returns signed upload URLs, the browser uploads
// straight to storage (Vercel caps request bodies below the 10 MB file limit),
// then "submit" checks the files and puts the application back in the queue.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("요청 형식이 올바르지 않습니다.", 400);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("서류 제출 기능이 아직 설정되지 않았습니다.", 503);
  }

  const { data: application } = await admin
    .from("account_creation_requests")
    .select("id,full_name,email,requested_role,status,review_note")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!application || application.status !== "needs_info") {
    return jsonError("보완 요청을 받은 지원서가 없습니다.", 409);
  }

  if (body.step === "prepare") {
    const documents = normalizeDocuments(body.documents);
    if (!documents) {
      return jsonError(`PDF, JPG, PNG 파일을 ${MAX_FILES}개까지, 파일당 10MB 이하로 올려 주세요.`, 400);
    }
    const storage = admin.storage.from(TUTOR_UPLOAD_BUCKET);
    const uploads: Array<{ path: string; token: string }> = [];
    for (const document of documents) {
      const path = `${RESUBMISSION_PREFIX}/${application.id}-${user.id}-${randomUUID()}.${documentExtension(document.mimeType)}`;
      const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.token) return jsonError("업로드를 준비하지 못했습니다. 다시 시도해 주세요.", 503);
      uploads.push({ path, token: data.token });
    }
    return NextResponse.json({ uploads }, noStore());
  }

  if (body.step !== "submit") return jsonError("요청 단계를 확인해 주세요.", 400);

  const documents = normalizeDocuments(body.documents);
  const paths = Array.isArray(body.documents)
    ? (body.documents as Array<Record<string, unknown>>).map((item) => item?.path)
    : [];
  const ownPath = new RegExp(`^${RESUBMISSION_PREFIX}/${application.id}-${user.id}-[0-9a-f-]{36}\\.(pdf|jpg|png)$`);
  if (
    !documents
    || paths.length !== documents.length
    || paths.some((path, index) => (
      typeof path !== "string"
      || !ownPath.test(path)
      || !path.endsWith(`.${documentExtension(documents[index].mimeType)}`)
    ))
    || new Set(paths).size !== paths.length
  ) {
    return jsonError("업로드한 서류 정보를 확인하지 못했습니다. 다시 올려 주세요.", 400);
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

  const uploaded = documents.map((document, index) => ({
    kind: "credential" as const,
    storagePath: paths[index] as string,
    originalName: document.originalName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
  }));
  const verified = await validateUploadedTutorDocuments(admin, { documents: uploaded });
  if (verified.error) return jsonError(verified.error, 400);

  const { error: documentError } = await admin
    .from("account_request_documents")
    .insert(uploaded.map((document) => ({
      request_id: application.id,
      kind: document.kind,
      storage_path: document.storagePath,
      original_name: document.originalName,
      mime_type: document.mimeType,
      size_bytes: document.sizeBytes,
    })));
  if (documentError) return jsonError("제출 서류를 저장하지 못했습니다. 다시 시도해 주세요.", 500);

  const now = new Date().toISOString();
  const { data: reopened, error: reopenError } = await admin
    .from("account_creation_requests")
    .update({ status: "pending", resubmitted_at: now, resubmission_note: note || null, updated_at: now })
    .eq("id", application.id)
    .eq("status", "needs_info")
    .select("id")
    .maybeSingle();
  if (reopenError || !reopened) {
    await admin
      .from("account_request_documents")
      .delete()
      .eq("request_id", application.id)
      .in("storage_path", uploaded.map((document) => document.storagePath));
    return jsonError("지원서를 다시 제출하지 못했습니다. 새로고침 후 다시 시도해 주세요.", 409);
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ account_status: "pending", updated_at: now })
    .eq("id", user.id)
    .eq("account_status", "needs_info");
  if (profileError) console.error("[application resubmit] profile status", { id: application.id, message: profileError.message });

  try {
    await sendAdminEventEmail({
      eventKey: `application-resubmitted-${application.id}-${Date.parse(now)}`,
      eyebrow: "Admissions",
      heading: "보완 서류가 제출되었습니다.",
      subject: `[선배] 보완 서류 제출 · ${application.full_name || application.email}`,
      rows: [
        ["신청 번호", `#${application.id}`],
        ["지원자", application.full_name || "-"],
        ["이메일", application.email],
        ["추가 서류", `${uploaded.length}건`],
      ],
      ...(note ? { note: { title: "지원자 메모", body: note } } : {}),
      portalPath: "/admin/applications",
      origin: request.nextUrl.origin,
      replyTo: application.email,
    });
  } catch (mailError) {
    console.error("[application resubmit] admissions email", {
      id: application.id,
      message: mailError instanceof Error ? mailError.message.slice(0, 300) : "Email failed",
    });
  }

  return NextResponse.json({ ok: true }, noStore());
}

function normalizeDocuments(value: unknown): RequestedDocument[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FILES) return null;
  const documents: RequestedDocument[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const sizeBytes = Number(record.sizeBytes);
    const originalName = safeOriginalFileName(record.originalName);
    if (
      !isDocumentMimeType(record.mimeType)
      || !Number.isInteger(sizeBytes)
      || sizeBytes < 1
      || sizeBytes > MAX_DOCUMENT_BYTES
      || !originalName
    ) {
      return null;
    }
    documents.push({ originalName, mimeType: record.mimeType, sizeBytes });
  }
  return documents;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, ...noStore() });
}

function noStore() {
  return { headers: { "Cache-Control": "private, no-store, max-age=0" } };
}
