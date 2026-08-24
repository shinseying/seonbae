import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import {
  createZoomMeeting,
  deleteZoomMeeting,
  getDefaultZoomHostEmail,
  ZoomApiError,
} from "../../../../utils/zoom/server";

export const dynamic = "force-dynamic";

// Parent consultations now live in consultation_requests. A row with a
// zoom_meeting_number is a scheduled consultation (상담 일정); without one it is
// an inbound inquiry (상담 신청). The client keeps the older field names, so map
// the unified columns back to that shape on the way out.
const consultationSelect =
  "id,user_id,session_date,starts_at,duration_minutes,actual_minutes,subject,meeting_title,notes,zoom_meeting_number,zoom_host_email,zoom_status";

function toClientConsultation(row: Record<string, unknown>) {
  return {
    id: row.id,
    parent_id: row.user_id,
    session_date: row.session_date,
    starts_at: row.starts_at,
    duration_minutes: row.duration_minutes,
    actual_minutes: row.actual_minutes ?? null,
    topic: row.subject,
    title: row.meeting_title,
    notes: row.notes,
    zoom_meeting_number: row.zoom_meeting_number,
    zoom_status: row.zoom_status,
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const parentId = cleanText(body.parentId, 80);
  const sessionDate = cleanText(body.sessionDate, 10);
  const startsAt = cleanText(body.startsAt, 5);
  const durationMinutes = Number(body.durationMinutes);
  const topic = cleanText(body.topic, 120);
  const title = cleanText(body.title, 160);
  const notes = nullableText(body.notes, 1000);

  if (
    !parentId
    || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
    || !/^\d{2}:\d{2}$/.test(startsAt)
    || !Number.isInteger(durationMinutes)
    || durationMinutes < 15
    || durationMinutes > 180
    || !topic
    || !title
  ) {
    return NextResponse.json(
      { error: "보호자, 일정과 상담 내용을 모두 확인해 주세요." },
      { status: 400 },
    );
  }

  const scheduledStart = new Date(`${sessionDate}T${startsAt}:00+09:00`);
  if (
    Number.isNaN(scheduledStart.getTime())
    || scheduledStart.getTime() < Date.now() - 5 * 60 * 1000
  ) {
    return NextResponse.json(
      { error: "상담 시작 시각은 현재 이후로 설정해 주세요." },
      { status: 400 },
    );
  }

  const { data: parent } = await auth.supabase
    .from("profiles")
    .select("id,role,full_name,email")
    .eq("id", parentId)
    .single();
  if (!parent || parent.role !== "parent") {
    return NextResponse.json(
      { error: "선택한 계정이 보호자 계정인지 확인해 주세요." },
      { status: 400 },
    );
  }

  const hostEmail = getDefaultZoomHostEmail();
  if (!hostEmail) {
    return NextResponse.json(
      { error: "선배팀 Zoom 호스트 이메일을 먼저 설정해 주세요." },
      { status: 400 },
    );
  }

  let meeting;
  try {
    meeting = await createZoomMeeting({
      hostEmail,
      topic: `[선배 보호자 상담] ${title}`,
      startTime: scheduledStart.toISOString(),
      durationMinutes,
    });
  } catch (error) {
    return zoomErrorResponse(error);
  }

  const meetingNumber = String(meeting.id);
  const { data, error } = await auth.supabase
    .from("consultation_requests")
    .insert({
      user_id: parentId,
      name: parent.full_name?.trim() || "보호자",
      email: parent.email || null,
      subject: topic,
      session_date: sessionDate,
      starts_at: `${startsAt}:00`,
      duration_minutes: durationMinutes,
      meeting_title: title,
      notes,
      status: "contacted",
      source: "website",
      language: "ko",
      zoom_meeting_number: meetingNumber,
      zoom_meeting_uuid: meeting.uuid,
      zoom_passcode: meeting.password || null,
      zoom_join_url: meeting.join_url || null,
      zoom_host_email: hostEmail,
      zoom_status: "scheduled",
      zoom_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(consultationSelect)
    .single();

  if (error || !data) {
    try {
      await deleteZoomMeeting(meetingNumber);
    } catch {
      // The database error is primary; Zoom cleanup is best-effort.
    }
    return NextResponse.json({ error: "상담 일정을 저장하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json(toClientConsultation(data), {
    status: 201,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const consultationId = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(consultationId) || consultationId < 1) {
    return NextResponse.json({ error: "상담 번호가 올바르지 않습니다." }, { status: 400 });
  }

  const { data: consultation } = await auth.supabase
    .from("consultation_requests")
    .select("id,zoom_meeting_number")
    .eq("id", consultationId)
    .single();
  if (!consultation) {
    return NextResponse.json({ error: "상담 일정을 찾지 못했습니다." }, { status: 404 });
  }

  if (consultation.zoom_meeting_number) {
    try {
      await deleteZoomMeeting(consultation.zoom_meeting_number);
    } catch (error) {
      if (!(error instanceof ZoomApiError) || error.status !== 404) {
        return zoomErrorResponse(error);
      }
    }
  }

  const { error } = await auth.supabase
    .from("consultation_requests")
    .update({
      zoom_status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", consultationId);

  if (error) {
    return NextResponse.json({ error: "상담 취소 상태를 저장하지 못했습니다." }, { status: 500 });
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
      error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return {
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }
  return { supabase };
}

function zoomErrorResponse(error: unknown) {
  if (error instanceof ZoomApiError) {
    return NextResponse.json(
      { error: `Zoom에서 상담을 준비하지 못했습니다. ${error.message}` },
      { status: error.status === 503 ? 503 : 502 },
    );
  }
  return NextResponse.json(
    { error: "Zoom에서 상담을 준비하지 못했습니다." },
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
