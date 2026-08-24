import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import { sendBookingEmail } from "../../../utils/email/booking";

export const dynamic = "force-dynamic";

const DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

// A signed-in student or parent books lessons with a tutor. Intro calls are
// withdrawn, so there is no anonymous path into this route.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("로그인 후 예약할 수 있습니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,phone,role,account_status")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "student" && profile.role !== "parent")) {
    return error("학생 또는 보호자 계정만 예약할 수 있습니다.", 403);
  }
  if (profile.account_status !== "approved") {
    return error("계정 승인 후 예약할 수 있습니다.", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const tutorRegistryId = text(body.tutorRegistryId, 24);
  const subject = text(body.subject, 100);
  const preferredDay = text(body.preferredDay, 3).toLowerCase();
  const preferredTime = text(body.preferredTime, 20);
  const note = text(body.note, 1000) || null;

  if (!tutorRegistryId) return error("튜터를 확인하지 못했습니다.", 400);
  if (!subject) return error("과목을 입력해 주세요.", 400);
  if (!preferredDay || !DAYS.has(preferredDay)) return error("희망 요일을 선택해 주세요.", 400);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredTime)) {
    return error("희망 시각을 24시간 형식으로 선택해 주세요.", 400);
  }

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

  const requesterName = profile.full_name || profile.email || "회원";
  const requesterEmail = profile.email || user.email || "";

  const { data: booking, error: insertError } = await admin
    .from("booking_requests")
    .insert({
      tutor_registry_id: tutorRegistryId,
      requester_id: user.id,
      name: requesterName,
      email: requesterEmail,
      phone: profile.phone ?? null,
      subject,
      preferred_day: preferredDay,
      preferred_time: preferredTime,
      note,
    })
    .select("id")
    .single();

  if (insertError || !booking) return error("예약을 저장하지 못했습니다.", 500);

  // A match notifies the admin first. The admin reviews it in the portal and
  // forwards it to the tutor from there (POST /api/admin/bookings), so the
  // tutor is not emailed at booking time. A send failure never loses the row.
  const adminEmail = process.env.ADMISSIONS_FROM_EMAIL;
  if (adminEmail) {
    try {
      await sendBookingEmail({
        bookingId: booking.id,
        tutorName: `${tutor.name} 튜터`,
        tutorEmail: adminEmail,
        name: requesterName,
        email: requesterEmail,
        phone: profile.phone ?? null,
        subject,
        preferredDay,
        preferredTime,
        note,
        portalUrl: `${request.nextUrl.origin}/admin/bookings`,
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
