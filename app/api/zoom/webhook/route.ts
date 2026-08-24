import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import {
  verifyZoomWebhookSignature,
  zoomWebhookValidationResponse,
} from "../../../../utils/zoom/server";

export const dynamic = "force-dynamic";

type ZoomWebhookBody = {
  event?: string;
  event_id?: string;
  event_ts?: number;
  payload?: {
    plainToken?: string;
    object?: {
      id?: string | number;
      uuid?: string;
      start_time?: string;
      end_time?: string;
      participant?: {
        id?: string;
        user_id?: string;
        user_name?: string;
        email?: string;
        join_time?: string;
        leave_time?: string;
      };
    };
  };
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let body: ZoomWebhookBody;
  try {
    body = JSON.parse(rawBody) as ZoomWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (body.event === "endpoint.url_validation") {
    const plainToken = body.payload?.plainToken;
    if (!plainToken) {
      return NextResponse.json({ error: "Missing plain token." }, { status: 400 });
    }
    try {
      return NextResponse.json(zoomWebhookValidationResponse(plainToken));
    } catch {
      return NextResponse.json(
        { error: "Webhook verification is not configured." },
        { status: 503 },
      );
    }
  }

  const verified = verifyZoomWebhookSignature(
    rawBody,
    request.headers.get("x-zm-request-timestamp"),
    request.headers.get("x-zm-signature"),
  );
  if (!verified) {
    return NextResponse.json(
      { error: "Invalid Zoom signature." },
      { status: 401 },
    );
  }

  const event = body.event || "";
  const meetingNumber = body.payload?.object?.id
    ? String(body.payload.object.id)
    : "";
  if (!meetingNumber) {
    return new NextResponse(null, { status: 204 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server administration is not configured." },
      { status: 503 },
    );
  }

  const { data: lesson } = await admin
    .from("portal_sessions")
    .select("id,zoom_started_at,duration_minutes")
    .eq("zoom_meeting_number", meetingNumber)
    .maybeSingle();

  const { data: consultation } = lesson
    ? { data: null }
    : await admin
        .from("consultation_requests")
        .select("id,zoom_started_at,duration_minutes")
        .eq("zoom_meeting_number", meetingNumber)
        .maybeSingle();

  if (!lesson && !consultation) {
    return new NextResponse(null, { status: 204 });
  }

  if (event === "meeting.started" || event === "meeting.ended") {
    const table = lesson ? "portal_sessions" : "consultation_requests";
    const record = lesson || consultation;
    const now = new Date().toISOString();
    const startedAt =
      body.payload?.object?.start_time
      || record?.zoom_started_at
      || now;
    const endedAt = body.payload?.object?.end_time || now;
    const updates =
      event === "meeting.started"
        ? {
            zoom_status: "live",
            zoom_started_at: startedAt,
            updated_at: now,
          }
        : {
            zoom_status: "ended",
            zoom_ended_at: endedAt,
            actual_minutes: elapsedMinutes(
              startedAt,
              endedAt,
              record?.duration_minutes || 0,
            ),
            updated_at: now,
          };

    await admin
      .from(table)
      .update(updates)
      .eq("id", record!.id);
  }

  if (
    lesson
    && (event === "meeting.participant_joined"
      || event === "meeting.participant_left")
  ) {
    const participant = body.payload?.object?.participant;
    const participantId = participant?.id || participant?.user_id || null;
    const timestamp =
      event === "meeting.participant_joined"
        ? participant?.join_time
        : participant?.leave_time;
    const eventId =
      body.event_id
      || [
        event,
        body.event_ts || Date.now(),
        participantId || participant?.user_name || "unknown",
      ].join(":");

    await admin.from("zoom_attendance").upsert(
      {
        event_id: eventId,
        session_id: lesson.id,
        zoom_participant_id: participantId,
        participant_name: participant?.user_name || null,
        participant_email: participant?.email || null,
        joined_at:
          event === "meeting.participant_joined"
            ? timestamp || new Date().toISOString()
            : null,
        left_at:
          event === "meeting.participant_left"
            ? timestamp || new Date().toISOString()
            : null,
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  }

  return new NextResponse(null, { status: 204 });
}

function elapsedMinutes(
  startedAt: string,
  endedAt: string,
  fallbackMinutes: number,
) {
  const started = new Date(startedAt).getTime();
  const ended = new Date(endedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) {
    return Math.max(0, fallbackMinutes);
  }
  return Math.min(1440, Math.max(1, Math.round((ended - started) / 60000)));
}
