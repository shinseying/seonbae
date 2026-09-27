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
  if (!Number.isInteger(id)) return error("매칭 요청을 확인하지 못했습니다.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("매칭 요청 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: booking } = await admin
    .from("booking_requests")
    .select("id,tutor_registry_id,name,email,phone,subject,preferred_day,preferred_time,note")
    .eq("id", id)
    .single();
  if (!booking) return error("매칭 요청을 찾지 못했습니다.", 404);

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
      purpose: "tutor",
    });
  } catch (sendError) {
    // The provider's own wording is not useful to an admin; the detail goes to
    // the row so it can still be diagnosed.
    await admin
      .from("booking_requests")
      .update({ notification_error: String(sendError).slice(0, 500) })
      .eq("id", booking.id);
    return error("튜터에게 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
  }

  const forwardedAt = new Date().toISOString();
  await admin
    .from("booking_requests")
    .update({ forwarded_at: forwardedAt, forwarded_by: user.id })
    .eq("id", booking.id);

  return NextResponse.json({ ok: true, forwardedAt });
}

// Rematch: a tutor declined, so the admin hands the request to another tutor.
// The row goes back to the forwardable state; the admin then forwards it with
// POST as usual, which emails the new tutor.
export async function PATCH(request: NextRequest) {
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

  let body: { id?: unknown; tutorRegistryId?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }
  const id = Number(body.id);
  const tutorRegistryId = typeof body.tutorRegistryId === "string" ? body.tutorRegistryId.trim().slice(0, 24) : "";
  if (!Number.isInteger(id) || !tutorRegistryId) return error("매칭 요청과 튜터를 선택해 주세요.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("매칭 요청 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: tutorAccount } = await admin
    .from("profiles")
    .select("id")
    .eq("tutor_registry_id", tutorRegistryId)
    .eq("role", "tutor")
    .eq("account_status", "approved")
    .maybeSingle();
  if (!tutorAccount) return error("승인된 튜터 계정이 있는 튜터만 배정할 수 있습니다.", 409);

  // Only a declined request can move; the status filter keeps two admins from
  // reassigning the same request at once.
  const { data: moved } = await admin
    .from("booking_requests")
    .update({
      tutor_registry_id: tutorRegistryId,
      status: "new",
      forwarded_at: null,
      forwarded_by: null,
      decided_at: null,
      classroom_id: null,
      seen_by_tutor: false,
      seen_by_admin: true,
      notification_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "declined")
    .select("id")
    .maybeSingle();
  if (!moved) return error("거절된 매칭 요청만 다른 튜터에게 배정할 수 있습니다.", 409);

  return NextResponse.json({ ok: true });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
