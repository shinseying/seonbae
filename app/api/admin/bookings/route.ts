import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { sendBookingEmail } from "../../../../utils/email/booking";

export const dynamic = "force-dynamic";

// Admin forwards a match to the tutor: emails the tutor and stamps forwarded_at.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return error("관리자 권한이 필요합니다.", 403);

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }
  const id = Number(body.id);
  if (!Number.isInteger(id)) return error("예약을 확인하지 못했습니다.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("예약 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: booking } = await admin
    .from("booking_requests")
    .select("id,tutor_registry_id,name,email,phone,subject,preferred_day,preferred_time,note")
    .eq("id", id)
    .single();
  if (!booking) return error("예약을 찾지 못했습니다.", 404);

  const [{ data: tutor }, { data: tutorProfile }] = await Promise.all([
    admin.from("tutors").select("name").eq("registry_id", booking.tutor_registry_id).maybeSingle(),
    admin.from("profiles").select("email").eq("tutor_registry_id", booking.tutor_registry_id).maybeSingle(),
  ]);
  if (!tutorProfile?.email) return error("튜터 이메일을 찾지 못했습니다. 튜터 계정을 먼저 연결해 주세요.", 409);

  try {
    await sendBookingEmail({
      bookingId: booking.id,
      tutorName: tutor?.name || "선배 튜터",
      tutorEmail: tutorProfile.email,
      name: booking.name,
      email: booking.email,
      phone: booking.phone,
      subject: booking.subject,
      preferredDay: booking.preferred_day,
      preferredTime: booking.preferred_time,
      note: booking.note,
      portalUrl: `${request.nextUrl.origin}/portal/tutor`,
    });
  } catch (sendError) {
    return error(`튜터에게 전달하지 못했습니다. ${String(sendError).slice(0, 200)}`, 502);
  }

  const forwardedAt = new Date().toISOString();
  await admin
    .from("booking_requests")
    .update({ forwarded_at: forwardedAt, forwarded_by: user.id })
    .eq("id", booking.id);

  return NextResponse.json({ ok: true, forwardedAt });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
