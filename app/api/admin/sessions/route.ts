import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import {
  createZoomMeeting,
  deleteZoomMeeting,
  getDefaultZoomHostEmail,
  ZoomApiError,
} from "../../../../utils/zoom/server";

export const dynamic = "force-dynamic";

const sessionFields =
  "id,user_id,tutor_registry_id,session_date,starts_at,duration_minutes,subject,title,session_type,location,notes,zoom_meeting_number,zoom_host_email,zoom_status,zoom_created_at";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const userId = cleanText(body.userId, 80);
  const tutorRegistryId = cleanText(body.tutorRegistryId, 24);
  const sessionDate = cleanText(body.sessionDate, 10);
  const startsAt = cleanText(body.startsAt, 5);
  const durationMinutes = Number(body.durationMinutes);
  const subject = cleanText(body.subject, 100);
  const title = cleanText(body.title, 160);
  const notes = nullableText(body.notes, 1000);

  if (
    !userId
    || !tutorRegistryId
    || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
    || !/^\d{2}:\d{2}$/.test(startsAt)
    || !Number.isInteger(durationMinutes)
    || durationMinutes < 15
    || durationMinutes > 240
    || !subject
    || !title
  ) {
    return NextResponse.json(
      { error: "학생, 튜터, 일정과 수업 정보를 모두 확인해 주세요." },
      { status: 400 },
    );
  }

  const scheduledStart = new Date(`${sessionDate}T${startsAt}:00+09:00`);
  if (
    Number.isNaN(scheduledStart.getTime())
    || scheduledStart.getTime() < Date.now() - 5 * 60 * 1000
  ) {
    return NextResponse.json(
      { error: "수업 시작 시각은 현재 이후로 설정해 주세요." },
      { status: 400 },
    );
  }

  const [{ data: student }, { data: tutor }] = await Promise.all([
    auth.supabase
      .from("profiles")
      .select("id,role,full_name")
      .eq("id", userId)
      .single(),
    auth.supabase
      .from("tutors")
      .select("registry_id,name,zoom_host_email")
      .eq("registry_id", tutorRegistryId)
      .single(),
  ]);

  if (!student || student.role !== "student") {
    return NextResponse.json(
      { error: "선택한 학생 계정을 확인하지 못했습니다." },
      { status: 400 },
    );
  }
  if (!tutor) {
    return NextResponse.json(
      { error: "선택한 튜터를 확인하지 못했습니다." },
      { status: 400 },
    );
  }

  const hostEmail =
    getDefaultZoomHostEmail()
    || tutor.zoom_host_email?.trim().toLowerCase();
  if (!hostEmail) {
    return NextResponse.json(
      { error: "튜터 또는 기본 Zoom 호스트 이메일을 먼저 설정해 주세요." },
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
    return zoomErrorResponse(error);
  }

  const meetingNumber = String(meeting.id);
  const { data, error } = await auth.supabase
    .from("portal_sessions")
    .insert({
      user_id: userId,
      tutor_registry_id: tutorRegistryId,
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
      zoom_join_url: meeting.join_url || null,
      zoom_host_email: hostEmail,
      zoom_status: "scheduled",
      zoom_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(sessionFields)
    .single();

  if (error) {
    try {
      await deleteZoomMeeting(meetingNumber);
    } catch {
      // The database error is primary; Zoom cleanup is best-effort.
    }
    return NextResponse.json(
      { error: "수업 일정을 저장하지 못했습니다." },
      { status: 500 },
    );
  }

  await auth.supabase.from("chat_threads").upsert(
    {
      student_id: userId,
      tutor_registry_id: tutorRegistryId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,tutor_registry_id" },
  );

  return NextResponse.json(data, {
    status: 201,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const sessionId = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
    return NextResponse.json(
      { error: "수업 번호가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const { data: session } = await auth.supabase
    .from("portal_sessions")
    .select("id,zoom_meeting_number")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: "수업을 찾지 못했습니다." },
      { status: 404 },
    );
  }

  if (session.zoom_meeting_number) {
    try {
      await deleteZoomMeeting(session.zoom_meeting_number);
    } catch (error) {
      if (!(error instanceof ZoomApiError) || error.status !== 404) {
        return zoomErrorResponse(error);
      }
    }
  }

  const { error } = await auth.supabase
    .from("portal_sessions")
    .update({
      zoom_status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    return NextResponse.json(
      { error: "수업 취소 상태를 저장하지 못했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      ),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 },
      ),
    };
  }

  return { supabase };
}

function zoomErrorResponse(error: unknown) {
  if (error instanceof ZoomApiError) {
    const status = error.status === 503 ? 503 : 502;
    return NextResponse.json(
      {
        error:
          status === 503
            ? error.message
            : `Zoom에서 수업을 준비하지 못했습니다. ${error.message}`,
      },
      { status },
    );
  }
  return NextResponse.json(
    { error: "Zoom에서 수업을 준비하지 못했습니다." },
    { status: 502 },
  );
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const text = cleanText(value, maxLength);
  return text || null;
}
