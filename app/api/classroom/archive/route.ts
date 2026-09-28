import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const HOMEWORK_BUCKET = "homework-files";
const STATUS_KO: Record<string, string> = {
  todo: "진행 중",
  submitted: "제출 완료",
  needs_revision: "수정 필요",
  graded: "반환 완료",
  scheduled: "예정",
  ended: "완료",
  cancelled: "취소",
};

// The ZIP of an ended match: lessons, homework with instructions and
// feedback, and every homework file. Only the room's student and its approved
// parents may download it, and only until the archive's purge_after.
export async function GET(request: NextRequest) {
  const classroomId = Number(request.nextUrl.searchParams.get("classroomId"));
  if (!Number.isSafeInteger(classroomId) || classroomId < 1) return error("교실을 확인하지 못했습니다.", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("로그인이 필요합니다.", 401);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("교실 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: room } = await admin
    .from("classrooms")
    .select("id,title,student_id,tutor_registry_id,ended_at,purge_after,end_reason")
    .eq("id", classroomId)
    .maybeSingle();
  let allowed = Boolean(room && room.student_id === user.id);
  if (room && !allowed) {
    const { data: membership } = await admin
      .from("classroom_members")
      .select("id")
      .eq("classroom_id", room.id)
      .eq("user_id", user.id)
      .eq("role", "parent")
      .eq("status", "approved")
      .maybeSingle();
    allowed = Boolean(membership);
  }
  if (!room || !allowed) return error("교실을 찾지 못했습니다.", 404);
  if (!room.ended_at || !room.student_id) return error("종료된 교실만 내려받을 수 있습니다.", 409);
  if (!room.purge_after || Date.parse(room.purge_after) < Date.now()) {
    return error("내려받기 기간이 지났습니다.", 410);
  }

  const [{ data: tutor }, { data: student }, { data: lessons }, { data: homework }] = await Promise.all([
    admin.from("tutors").select("name").eq("registry_id", room.tutor_registry_id).maybeSingle(),
    admin.from("profiles").select("full_name,email").eq("id", room.student_id).maybeSingle(),
    admin
      .from("portal_sessions")
      .select("session_date,starts_at,duration_minutes,actual_minutes,subject,title,notes,zoom_status,cancellation_reason")
      .eq("user_id", room.student_id)
      .eq("tutor_registry_id", room.tutor_registry_id)
      .lte("created_at", room.ended_at)
      .order("session_date", { ascending: true }),
    admin
      .from("portal_assignments")
      .select("id,subject,title,instructions,due_date,status,feedback,submitted_at,graded_at,attachment_name,attachment_path,student_attachment_name,student_attachment_path")
      .eq("student_id", room.student_id)
      .eq("tutor_registry_id", room.tutor_registry_id)
      .lte("created_at", room.ended_at)
      .order("created_at", { ascending: true }),
  ]);

  const zip = new JSZip();
  const title = room.title || `교실 ${room.id}`;
  zip.file(
    "요약.txt",
    [
      `교실: ${title}`,
      `학생: ${student?.full_name || student?.email || "-"}`,
      `튜터: ${tutor?.name || room.tutor_registry_id}`,
      `매칭 종료: ${koreanDateTime(room.ended_at)}`,
      room.end_reason ? `종료 사유: ${room.end_reason}` : null,
      `이 자료는 ${koreanDateTime(room.purge_after)}에 선배 서버에서 삭제됩니다.`,
      "",
      `수업 ${lessons?.length ?? 0}건, 숙제 ${homework?.length ?? 0}건`,
    ].filter((line) => line !== null).join("\r\n"),
  );

  const header = ["날짜", "시작", "예정 시간(분)", "실제 시간(분)", "과목", "제목", "상태", "전달 사항", "취소 사유"];
  const rows = (lessons ?? []).map((lesson) => [
    lesson.session_date,
    lesson.starts_at?.slice(0, 5) ?? "",
    lesson.duration_minutes ?? "",
    lesson.actual_minutes ?? "",
    lesson.subject,
    lesson.title,
    STATUS_KO[lesson.zoom_status] ?? lesson.zoom_status,
    lesson.notes ?? "",
    lesson.cancellation_reason ?? "",
  ]);
  // The byte-order mark lets Excel open the Korean text as UTF-8.
  zip.file("수업.csv", "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"));

  for (const [index, item] of (homework ?? []).entries()) {
    const folder = zip.folder(`숙제/${String(index + 1).padStart(2, "0")}-${safeName(item.title)}`)!;
    folder.file(
      "숙제.txt",
      [
        `제목: ${item.title}`,
        `과목: ${item.subject}`,
        `마감: ${item.due_date ?? "-"}`,
        `상태: ${STATUS_KO[item.status] ?? item.status}`,
        item.submitted_at ? `제출: ${koreanDateTime(item.submitted_at)}` : null,
        item.graded_at ? `반환: ${koreanDateTime(item.graded_at)}` : null,
        "",
        "[안내]",
        item.instructions || "-",
        "",
        "[피드백]",
        item.feedback || "-",
      ].filter((line) => line !== null).join("\r\n"),
    );
    const files: Array<[string | null, string | null, string]> = [
      [item.attachment_path, item.attachment_name, "튜터 첨부"],
      [item.student_attachment_path, item.student_attachment_name, "내 제출"],
    ];
    for (const [path, name, label] of files) {
      if (!path) continue;
      const { data: blob } = await admin.storage.from(HOMEWORK_BUCKET).download(path);
      if (blob) folder.file(`${label} - ${safeName(name || "파일")}`, new Uint8Array(await blob.arrayBuffer()));
    }
  }

  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const fileName = `선배-${safeName(title)}-기록.zip`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="seonbae-classroom-${room.id}.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "파일";
}

function koreanDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
