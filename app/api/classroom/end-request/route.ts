import { NextRequest, NextResponse } from "next/server";
import { sendAdminEventEmail } from "../../../../utils/email/admin-event";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";

// The student, an approved parent in the room, or the room's tutor asks the
// admin to end the match. The admin decides at /admin/classroom-ends.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status,tutor_registry_id,full_name,email")
    .eq("id", user.id)
    .single();
  if (!profile || profile.account_status !== "approved") {
    return error("승인된 계정만 매칭 종료를 요청할 수 있습니다.", 403);
  }

  let body: { classroomId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }
  const classroomId = Number(body.classroomId);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!Number.isSafeInteger(classroomId) || classroomId < 1) return error("교실을 확인하지 못했습니다.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("교실 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: room } = await admin
    .from("classrooms")
    .select("id,title,student_id,tutor_registry_id,ended_at")
    .eq("id", classroomId)
    .maybeSingle();
  if (!room) return error("교실을 찾지 못했습니다.", 404);

  let requesterRole: "student" | "parent" | "tutor" | null = null;
  if (profile.role === "student" && room.student_id === user.id) requesterRole = "student";
  if (profile.role === "tutor" && profile.tutor_registry_id === room.tutor_registry_id) requesterRole = "tutor";
  if (profile.role === "parent") {
    const { data: membership } = await admin
      .from("classroom_members")
      .select("id")
      .eq("classroom_id", room.id)
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();
    if (membership) requesterRole = "parent";
  }
  // Same answer as a missing room, so ids cannot be probed.
  if (!requesterRole) return error("교실을 찾지 못했습니다.", 404);
  if (room.ended_at) return error("이미 종료된 매칭입니다.", 409);
  if (!room.student_id) return error("학생이 배정되지 않은 교실입니다.", 409);

  const { data: saved, error: writeError } = await admin
    .from("classroom_end_requests")
    .insert({
      classroom_id: room.id,
      requested_by: user.id,
      requester_role: requesterRole,
      reason: reason || null,
    })
    .select("id")
    .single();
  if (writeError?.code === "23505") {
    return error("이미 종료 요청이 접수되어 관리자가 검토하고 있습니다.", 409);
  }
  if (writeError || !saved) return error("종료 요청을 저장하지 못했습니다.", 500);

  const roleLabel = { student: "학생", parent: "보호자", tutor: "튜터" }[requesterRole];
  try {
    await sendAdminEventEmail({
      eventKey: `classroom-end-${saved.id}`,
      eyebrow: "Seonbae classrooms",
      heading: "매칭 종료 요청이 접수되었습니다.",
      subject: `[선배 관리자] 매칭 종료 요청 · ${room.title || `교실 ${room.id}`}`,
      rows: [
        ["요청 번호", String(saved.id)],
        ["교실", room.title || `교실 ${room.id}`],
        ["튜터", room.tutor_registry_id],
        ["요청자", `${profile.full_name || profile.email} (${roleLabel})`],
      ],
      ...(reason ? { note: { title: "종료 사유", body: reason } } : {}),
      portalPath: "/admin/classroom-ends",
      origin: request.nextUrl.origin,
    });
  } catch (mailError) {
    console.error("Classroom end request admin email failed", {
      message: mailError instanceof Error ? mailError.message : "Unknown error",
    });
  }

  return NextResponse.json({ ok: true, id: saved.id }, { status: 201 });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
