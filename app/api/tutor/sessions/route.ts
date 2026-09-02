import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import {
  createZoomMeeting,
  deleteZoomMeeting,
  getDefaultZoomHostEmail,
  ZoomApiError,
} from "../../../../utils/zoom/server";
import { sendAdminEventEmail } from "../../../../utils/email/admin-event";

export const dynamic = "force-dynamic";

// A tutor schedules a Zoom lesson for a student they already work with. Admins
// keep their own route; this one is scoped to the caller's registry id and can
// never target a student the tutor has no existing thread or session with.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status,tutor_registry_id")
    .eq("id", user.id)
    .single();

  if (
    profile?.role !== "tutor"
    || profile.account_status !== "approved"
    || !profile.tutor_registry_id
  ) {
    return NextResponse.json({ error: "튜터 권한이 필요합니다." }, { status: 403 });
  }
  const registryId = profile.tutor_registry_id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const studentId = text(body.studentId, 80);
  const sessionDate = text(body.sessionDate, 10);
  const startsAt = text(body.startsAt, 5);
  const durationMinutes = Number(body.durationMinutes);
  const subject = text(body.subject, 100);
  const title = text(body.title, 160);
  const notes = text(body.notes, 1000) || null;

  if (
    !studentId
    || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
    || !/^\d{2}:\d{2}$/.test(startsAt)
    || !Number.isInteger(durationMinutes)
    || durationMinutes < 15
    || durationMinutes > 240
    || !subject
    || !title
  ) {
    return NextResponse.json(
      { error: "학생, 일정과 수업 정보를 모두 확인해 주세요." },
      { status: 400 },
    );
  }

  const scheduledStart = new Date(`${sessionDate}T${startsAt}:00+09:00`);
  if (Number.isNaN(scheduledStart.getTime()) || scheduledStart.getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json(
      { error: "수업 시작 시각은 현재 이후로 설정해 주세요." },
      { status: 400 },
    );
  }

  // Both reads run under the tutor's own RLS, so an unrelated student simply
  // returns nothing rather than leaking that the row exists.
  const [{ data: thread }, { data: priorSession }] = await Promise.all([
    supabase
      .from("chat_threads")
      .select("id")
      .eq("tutor_registry_id", registryId)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("portal_sessions")
      .select("id")
      .eq("tutor_registry_id", registryId)
      .eq("user_id", studentId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!thread && !priorSession) {
    return NextResponse.json(
      { error: "담당 학생만 수업을 개설할 수 있습니다." },
      { status: 403 },
    );
  }

  const { data: tutor } = await supabase
    .from("tutors")
    .select("zoom_host_email")
    .eq("registry_id", registryId)
    .single();

  const hostEmail = getDefaultZoomHostEmail() || tutor?.zoom_host_email?.trim().toLowerCase();
  if (!hostEmail) {
    return NextResponse.json(
      { error: "Zoom 호스트 이메일이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." },
      { status: 400 },
    );
  }

  let meeting;
  try {
    meeting = await createZoomMeeting({
      hostEmail,
      topic: `[선배] ${title}`,
      startTime: scheduledStart.toISOString(),
      durationMinutes,
    });
  } catch (error) {
    if (error instanceof ZoomApiError) {
      return NextResponse.json({ error: "Zoom 수업 생성에 실패했습니다." }, { status: 502 });
    }
    return NextResponse.json({ error: "Zoom 설정을 확인해 주세요." }, { status: 500 });
  }

  const meetingNumber = String(meeting.id);
  const { data: savedSession, error } = await supabase.from("portal_sessions").insert({
    user_id: studentId,
    tutor_registry_id: registryId,
    session_date: sessionDate,
    starts_at: `${startsAt}:00`,
    duration_minutes: durationMinutes,
    subject,
    title,
    session_type: "Zoom 온라인",
    location: "선배 학습 포털",
    notes,
    zoom_meeting_number: meetingNumber,
    zoom_meeting_uuid: meeting.uuid,
    zoom_passcode: meeting.password || null,
    zoom_host_email: hostEmail,
    zoom_status: "scheduled",
    zoom_created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select("id").single();

  if (error || !savedSession) {
    // The database is the source of truth, so an orphaned Zoom meeting is worse
    // than a failed cleanup. Best-effort either way.
    try {
      await deleteZoomMeeting(meetingNumber);
    } catch {
      /* ignored */
    }
    return NextResponse.json({ error: "수업을 저장하지 못했습니다." }, { status: 500 });
  }

  try {
    await sendAdminEventEmail({
      eventKey: `tutor-session-${savedSession.id}`,
      eyebrow: "Seonbae lessons",
      heading: "튜터가 새 Zoom 수업을 만들었습니다.",
      subject: `[선배 관리자] 새 Zoom 수업 · ${title}`,
      rows: [
        ["수업 번호", String(savedSession.id)],
        ["튜터", registryId],
        ["날짜", sessionDate],
        ["시각", startsAt],
        ["과목", subject],
      ],
      ...(notes ? { note: { title: "전달 사항", body: notes } } : {}),
      portalPath: "/admin/sessions",
      origin: request.nextUrl.origin,
    });
  } catch (mailError) {
    console.error("Tutor session admin email failed", {
      message: mailError instanceof Error ? mailError.message : "Unknown error",
    });
  }

  return NextResponse.json({ ok: true, meetingNumber });
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
