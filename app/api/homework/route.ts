import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export async function GET(request: NextRequest) {
  const submission = request.nextUrl.searchParams.get("submission");
  const rawAssignmentId = submission ?? request.nextUrl.searchParams.get("file");
  const assignmentId = Number(rawAssignmentId);
  if (!rawAssignmentId || !Number.isInteger(assignmentId) || assignmentId < 1) return jsonError("첨부 파일 번호를 확인해 주세요.", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const { data: assignment } = await supabase
    .from("portal_assignments")
    .select("attachment_path,student_attachment_path")
    .eq("id", assignmentId)
    .single();
  const storagePath = submission ? assignment?.student_attachment_path : assignment?.attachment_path;
  if (!storagePath) return jsonError("첨부 파일을 찾을 수 없습니다.", 404);

  try {
    const { data, error } = await createAdminClient().storage
      .from("homework-files")
      .createSignedUrl(storagePath, 10 * 60);
    if (error || !data?.signedUrl) return jsonError("첨부 파일 링크를 만들지 못했습니다.", 500);
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return jsonError("첨부 파일 저장소가 설정되지 않았습니다.", 503);
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,tutor_registry_id,account_status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.account_status !== "approved") {
    return jsonError("승인된 계정만 숙제 기능을 사용할 수 있습니다.", 403);
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError("요청 형식을 확인해 주세요.", 400);
    }
    if (formText(form, "action") === "submit") {
      if (profile.role !== "student") return jsonError("학생 계정만 숙제를 제출할 수 있습니다.", 403);
      return submitStudentWork(form, user.id);
    }
    if (profile.role !== "tutor" || !profile.tutor_registry_id) {
      return jsonError("튜터 계정만 숙제를 등록할 수 있습니다.", 403);
    }
    return createAssignment(form, supabase, profile.tutor_registry_id);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("요청 형식을 확인해 주세요.", 400);
  }

  if (body.action === "submit") {
    if (profile.role !== "student") return jsonError("학생 계정만 숙제를 제출할 수 있습니다.", 403);
    const assignmentId = Number(body.assignmentId);
    if (!Number.isInteger(assignmentId)) return jsonError("숙제 번호를 확인해 주세요.", 400);
    const submittedAt = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("portal_assignments")
      .update({
        status: "submitted",
        submitted_at: submittedAt,
        updated_at: submittedAt,
      })
      .eq("id", assignmentId)
      .eq("student_id", user.id)
      .in("status", ["todo", "needs_revision"])
      .select("*")
      .single();
    if (error) return jsonError("제출할 수 없는 숙제입니다.", 400);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action === "undo") {
    if (profile.role !== "student") return jsonError("학생 계정만 제출을 취소할 수 있습니다.", 403);
    const assignmentId = Number(body.assignmentId);
    if (!Number.isInteger(assignmentId)) return jsonError("숙제 번호를 확인해 주세요.", 400);
    const updatedAt = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("portal_assignments")
      .update({ status: "todo", submitted_at: null, updated_at: updatedAt })
      .eq("id", assignmentId)
      .eq("student_id", user.id)
      .eq("status", "submitted")
      .select("id,status,submitted_at,student_attachment_name")
      .single();
    if (error) return jsonError("검토가 시작된 숙제는 제출을 취소할 수 없습니다.", 400);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action === "grade") {
    if (profile.role !== "tutor" || !profile.tutor_registry_id) {
      return jsonError("튜터 계정만 피드백을 등록할 수 있습니다.", 403);
    }
    const assignmentId = Number(body.assignmentId);
    const feedback = cleanText(body.feedback, 3000);
    if (!Number.isInteger(assignmentId) || feedback.length < 2) {
      return jsonError("숙제 번호와 피드백을 확인해 주세요.", 400);
    }
    const returnMode = body.returnMode === "revision" ? "revision" : "returned";
    const returnedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("portal_assignments")
      .update({
        status: returnMode === "revision" ? "needs_revision" : "graded",
        feedback,
        graded_at: returnMode === "returned" ? returnedAt : null,
        returned_for_revision_at: returnMode === "revision" ? returnedAt : null,
        updated_at: returnedAt,
      })
      .eq("id", assignmentId)
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .eq("status", "submitted")
      .select("id,status,feedback,graded_at,returned_for_revision_at")
      .single();
    if (error) return jsonError("제출 완료된 숙제만 채점할 수 있습니다.", 400);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }

  return jsonError("지원하지 않는 숙제 작업입니다.", 400);
}

async function createAssignment(
  form: FormData,
  supabase: Awaited<ReturnType<typeof createClient>>,
  tutorRegistryId: string,
) {
  const studentId = formText(form, "studentId");
  const subject = formText(form, "subject").slice(0, 100);
  const title = formText(form, "title").slice(0, 180);
  const instructions = formText(form, "instructions").slice(0, 5000);
  const dueDate = formText(form, "dueDate");
  const attachment = form.get("attachment");

  if (!isUuid(studentId) || !subject || title.length < 2 || instructions.length < 2 || !isDate(dueDate)) {
    return jsonError("학생, 과목, 제목, 안내와 마감일을 모두 입력해 주세요.", 400);
  }

  let attachmentPath: string | null = null;
  let attachmentName: string | null = null;
  if (attachment instanceof File && attachment.size > 0) {
    if (attachment.size > MAX_FILE_BYTES || !ALLOWED_FILE_TYPES.has(attachment.type)) {
      return jsonError("첨부 파일은 10MB 이하 PDF, JPG, PNG, TXT, DOCX, XLSX 또는 PPTX만 가능합니다.", 400);
    }
    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch {
      return jsonError("파일 저장소가 설정되지 않았습니다.", 503);
    }
    attachmentName = displayFileName(attachment.name);
    attachmentPath = `${tutorRegistryId}/${studentId}/${crypto.randomUUID()}-${safeFileName(attachment.name)}`;
    const { error } = await admin.storage
      .from("homework-files")
      .upload(attachmentPath, await attachment.arrayBuffer(), {
        contentType: attachment.type,
        upsert: false,
      });
    if (error) return jsonError("숙제 첨부 파일을 저장하지 못했습니다.", 500);
  }

  const { data, error } = await supabase
    .from("portal_assignments")
    .insert({
      student_id: studentId,
      tutor_registry_id: tutorRegistryId,
      subject,
      title,
      instructions,
      due_date: dueDate,
      attachment_name: attachmentName,
      attachment_path: attachmentPath,
    })
    .select("id,student_id,subject,title,instructions,due_date,attachment_name,status,created_at")
    .single();

  if (error) {
    if (attachmentPath) {
      try {
        await createAdminClient().storage.from("homework-files").remove([attachmentPath]);
      } catch {
        // Database error remains primary; orphan cleanup can be retried by operations.
      }
    }
    return jsonError("해당 학생에게 숙제를 등록할 수 없습니다. 수업 배정을 확인해 주세요.", 400);
  }
  return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "no-store" } });
}

async function submitStudentWork(form: FormData, userId: string) {
  const assignmentId = Number(formText(form, "assignmentId"));
  if (!Number.isInteger(assignmentId)) return jsonError("숙제 번호를 확인해 주세요.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("파일 저장소가 설정되지 않았습니다.", 503);
  }

  const { data: assignment } = await admin
    .from("portal_assignments")
    .select("id,status,student_attachment_name,student_attachment_path")
    .eq("id", assignmentId)
    .eq("student_id", userId)
    .maybeSingle();
  if (!assignment || !["todo", "needs_revision"].includes(assignment.status)) {
    return jsonError("현재 제출할 수 없는 숙제입니다.", 400);
  }

  const attachment = form.get("studentAttachment");
  let attachmentName = assignment.student_attachment_name as string | null;
  let attachmentPath = assignment.student_attachment_path as string | null;
  let uploadedPath: string | null = null;
  if (attachment instanceof File && attachment.size > 0) {
    if (attachment.size > MAX_FILE_BYTES || !ALLOWED_FILE_TYPES.has(attachment.type)) {
      return jsonError("파일은 10MB 이하 PDF, JPG, PNG, TXT, DOCX, XLSX 또는 PPTX만 가능합니다.", 400);
    }
    attachmentName = displayFileName(attachment.name);
    uploadedPath = `submissions/${assignmentId}/${userId}/${crypto.randomUUID()}-${safeFileName(attachment.name)}`;
    const { error: uploadError } = await admin.storage
      .from("homework-files")
      .upload(uploadedPath, await attachment.arrayBuffer(), {
        contentType: attachment.type,
        upsert: false,
      });
    if (uploadError) return jsonError("제출 파일을 저장하지 못했습니다.", 500);
    attachmentPath = uploadedPath;
  }

  const submittedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("portal_assignments")
    .update({
      status: "submitted",
      submitted_at: submittedAt,
      student_attachment_name: attachmentName,
      student_attachment_path: attachmentPath,
      updated_at: submittedAt,
    })
    .eq("id", assignmentId)
    .eq("student_id", userId)
    .in("status", ["todo", "needs_revision"])
    .select("id,status,submitted_at,student_attachment_name")
    .single();

  if (error) {
    if (uploadedPath) await admin.storage.from("homework-files").remove([uploadedPath]);
    return jsonError("숙제를 제출하지 못했습니다.", 400);
  }
  if (uploadedPath && assignment.student_attachment_path && assignment.student_attachment_path !== uploadedPath) {
    await admin.storage.from("homework-files").remove([assignment.student_attachment_path]);
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "homework-file";
}

function displayFileName(value: string) {
  return value.trim().slice(0, 120) || "homework-file";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
