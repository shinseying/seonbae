import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import { sendBookingEmail } from "../../../utils/email/booking";
import { isEmailAddress } from "../../../utils/auth/school-email";
import { normalizePhone } from "../../../utils/auth/phone";
import { authRateLimitResponse, consumeAuthRateLimit } from "../../../utils/auth/rate-limit";

export const dynamic = "force-dynamic";

const DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

// A visitor books an intro call from a tutor card. No account is required, so
// this writes with the service-role client after validating the payload.
export async function POST(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "consultation");
  if (!rateLimit.allowed) return authRateLimitResponse(rateLimit.retryAfterSeconds);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const tutorRegistryId = text(body.tutorRegistryId, 24);
  const name = text(body.name, 80);
  const email = text(body.email, 254).toLowerCase();
  const phone = normalizePhone(text(body.phone, 24)) || null;
  const preferredDay = text(body.preferredDay, 3).toLowerCase();
  const preferredTime = text(body.preferredTime, 20);
  const note = text(body.note, 1000) || null;

  if (!tutorRegistryId) return error("튜터를 확인하지 못했습니다.", 400);
  if (name.length < 2) return error("이름을 입력해 주세요.", 400);
  if (!isEmailAddress(email)) return error("올바른 이메일 주소를 입력해 주세요.", 400);
  if (preferredDay && !DAYS.has(preferredDay)) return error("희망 요일을 다시 선택해 주세요.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("예약 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: tutor } = await admin
    .from("tutors")
    .select("registry_id,name,active")
    .eq("registry_id", tutorRegistryId)
    .single();
  if (!tutor || !tutor.active) return error("해당 튜터는 예약을 받을 수 없습니다.", 404);

  const { data: booking, error: insertError } = await admin
    .from("booking_requests")
    .insert({
      tutor_registry_id: tutorRegistryId,
      name,
      email,
      phone,
      preferred_day: preferredDay || null,
      preferred_time: preferredTime || null,
      note,
    })
    .select("id")
    .single();

  if (insertError || !booking) return error("예약을 저장하지 못했습니다.", 500);

  // The admin and the tutor both see this in their portal. Email is the tutor's
  // extra copy, and a failure to send never loses the booking.
  const { data: tutorProfile } = await admin
    .from("profiles")
    .select("email")
    .eq("tutor_registry_id", tutorRegistryId)
    .maybeSingle();

  if (tutorProfile?.email) {
    try {
      await sendBookingEmail({
        bookingId: booking.id,
        tutorName: tutor.name,
        tutorEmail: tutorProfile.email,
        name,
        email,
        phone,
        preferredDay: preferredDay || null,
        preferredTime: preferredTime || null,
        note,
        portalUrl: `${request.nextUrl.origin}/portal/tutor`,
      });
      await admin
        .from("booking_requests")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", booking.id);
    } catch (sendError) {
      await admin
        .from("booking_requests")
        .update({ notification_error: String(sendError).slice(0, 500) })
        .eq("id", booking.id);
    }
  }

  return NextResponse.json({ ok: true });
}

// Marks bookings read for whoever is asking, so the portal badge clears.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,tutor_registry_id")
    .eq("id", user.id)
    .single();
  if (!profile) return error("계정을 확인하지 못했습니다.", 403);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("예약 시스템이 아직 설정되지 않았습니다.", 503);
  }

  if (profile.role === "admin") {
    await admin.from("booking_requests").update({ seen_by_admin: true }).eq("seen_by_admin", false);
    return NextResponse.json({ ok: true });
  }
  if (profile.role === "tutor" && profile.tutor_registry_id) {
    await admin
      .from("booking_requests")
      .update({ seen_by_tutor: true })
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .eq("seen_by_tutor", false);
    return NextResponse.json({ ok: true });
  }
  return error("권한이 없습니다.", 403);
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
