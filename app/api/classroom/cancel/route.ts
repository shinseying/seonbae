import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { deleteZoomMeeting, ZoomApiError } from "../../../../utils/zoom/server";
import { sendAdminEventEmail } from "../../../../utils/email/admin-event";

export const dynamic = "force-dynamic";

// A student, their tutor, or a parent in the classroom files a cancellation
// against one scheduled lesson, with the reason they typed.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,account_status,tutor_registry_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.account_status !== "approved") {
    return error("승인된 계정만 수업을 취소할 수 있습니다.", 403);
  }

  let body: { sessionId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const sessionId = Number(body.sessionId);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!Number.isInteger(sessionId)) return error("수업을 확인하지 못했습니다.", 400);
  if (reason.length < 2) return error("취소 사유를 입력해 주세요.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("수업 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: session } = await admin
    .from("portal_sessions")
    .select("id,user_id,tutor_registry_id,session_date,starts_at,title,zoom_status,zoom_meeting_number")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return error("수업을 찾지 못했습니다.", 404);
  if (session.zoom_status === "cancelled") return error("이미 취소된 수업입니다.", 409);
  if (session.zoom_status === "ended") return error("이미 종료된 수업은 취소할 수 없습니다.", 409);

  // The classroom decides who may cancel: its student, its tutor, or a parent
  // the tutor let in.
  const isTutor = profile.role === "tutor" && profile.tutor_registry_id === session.tutor_registry_id;
  const isStudent = session.user_id === user.id;
  let isMember = false;
  if (!isTutor && !isStudent) {
    const { data: room } = await admin
      .from("classrooms")
      .select("id")
      .eq("student_id", session.user_id)
      .eq("tutor_registry_id", session.tutor_registry_id)
      .maybeSingle();
    if (room) {
      const { data: membership } = await admin
        .from("classroom_members")
        .select("id")
        .eq("classroom_id", room.id)
        .eq("user_id", user.id)
        .eq("status", "approved")
        .maybeSingle();
      isMember = Boolean(membership);
    }
  }
  if (!isTutor && !isStudent && !isMember) return error("이 수업을 취소할 수 없습니다.", 403);

  // Free the Zoom slot; a meeting that is already gone is not an error.
  if (session.zoom_meeting_number) {
    try {
      await deleteZoomMeeting(session.zoom_meeting_number);
    } catch (zoomError) {
      if (!(zoomError instanceof ZoomApiError) || zoomError.status !== 404) {
        return error("Zoom 회의를 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
      }
    }
  }

  const now = new Date().toISOString();
  const { error: writeError } = await admin
    .from("portal_sessions")
    .update({
      zoom_status: "cancelled",
      cancelled_by: user.id,
      cancelled_at: now,
      cancellation_reason: reason,
      updated_at: now,
    })
    .eq("id", sessionId);
  if (writeError) return error("취소를 저장하지 못했습니다.", 500);

  try {
    await sendAdminEventEmail({
      eventKey: `session-cancelled-${sessionId}-${Date.parse(now)}`,
      eyebrow: "Seonbae lesson update",
      heading: "수업이 취소되었습니다.",
      subject: `[선배 관리자] 수업 취소 · ${session.title}`,
      rows: [
        ["수업 번호", String(sessionId)],
        ["수업", session.title],
        ["일정", `${session.session_date} ${String(session.starts_at).slice(0, 5)}`],
        ["요청자", profile.full_name || profile.email || profile.role],
      ],
      note: { title: "취소 사유", body: reason },
      portalPath: "/admin/sessions",
      origin: request.nextUrl.origin,
      replyTo: profile.email || undefined,
    });
  } catch (mailError) {
    console.error("Cancellation admin email failed", {
      message: mailError instanceof Error ? mailError.message : "Unknown error",
    });
  }

  return NextResponse.json({ ok: true, cancelledAt: now });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
