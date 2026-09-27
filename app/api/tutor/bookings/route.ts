import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { sendAdminEventEmail } from "../../../../utils/email/admin-event";

export const dynamic = "force-dynamic";

// The tutor answers a match the admin forwarded. Accepting puts the requester
// into one of the tutor's classrooms: a student takes the empty seat, a parent
// joins as an approved member.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status,tutor_registry_id")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "tutor" || profile.account_status !== "approved" || !profile.tutor_registry_id) {
    return error("튜터 권한이 필요합니다.", 403);
  }

  let body: { id?: unknown; decision?: unknown; classroomId?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const id = Number(body.id);
  const decision = body.decision === "accepted" ? "accepted" : body.decision === "declined" ? "declined" : null;
  const classroomId = Number(body.classroomId);
  if (!Number.isInteger(id) || !decision) return error("요청을 확인하지 못했습니다.", 400);
  if (decision === "accepted" && !Number.isInteger(classroomId)) {
    return error("배정할 교실을 선택해 주세요.", 400);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("매칭 요청 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: result, error: decisionError } = await admin.rpc(
    "decide_tutor_booking",
    {
      p_booking_id: id,
      p_tutor_registry_id: profile.tutor_registry_id,
      p_decision: decision,
      p_classroom_id: decision === "accepted" ? classroomId : null,
      p_decided_by: user.id,
    },
  );

  if (decisionError) {
    const known = decisionError.message || "";
    if (known.includes("BOOKING_NOT_FORWARDED")) return error("아직 전달되지 않은 요청입니다.", 409);
    if (known.includes("BOOKING_ALREADY_DECIDED")) return error("이미 처리된 매칭 요청입니다.", 409);
    if (known.includes("BOOKING_CLASSROOM_OCCUPIED")) return error("이 교실에는 이미 다른 학생이 배정되어 있습니다.", 409);
    if (known.includes("BOOKING_CLASSROOM_FORBIDDEN")) return error("본인 교실만 배정할 수 있습니다.", 403);
    if (known.includes("BOOKING_FORBIDDEN")) return error("이 매칭 요청을 처리할 수 없습니다.", 403);
    if (known.includes("BOOKING_REQUESTER")) return error("요청자 계정을 교실에 배정할 수 없습니다.", 409);
    return error("매칭 처리 결과를 저장하지 못했습니다.", 500);
  }

  // A decline goes back to the admin for a rematch: it reappears as unread in
  // 매칭 요청 and the admin inbox gets a note. The decision above is already
  // saved, so a failed email does not undo it.
  if (decision === "declined") {
    await admin.from("booking_requests").update({ seen_by_admin: false }).eq("id", id);
    try {
      const [{ data: booking }, { data: tutor }] = await Promise.all([
        admin.from("booking_requests").select("name,subject").eq("id", id).single(),
        admin.from("tutors").select("name,roster_number").eq("registry_id", profile.tutor_registry_id).maybeSingle(),
      ]);
      await sendAdminEventEmail({
        eventKey: `booking-declined-${id}-${profile.tutor_registry_id}`,
        eyebrow: "Seonbae matches",
        heading: "튜터가 매칭 요청을 거절했습니다. 다른 튜터를 배정해 주세요.",
        subject: `[선배 관리자] 매칭 거절 · ${booking?.name || `요청 ${id}`}`,
        rows: [
          ["요청 번호", String(id)],
          ["요청자", booking?.name || "-"],
          ["과목", booking?.subject || "-"],
          ["거절한 튜터", tutor ? `${tutor.name} · ${tutor.roster_number || profile.tutor_registry_id}` : profile.tutor_registry_id],
        ],
        portalPath: "/admin/bookings",
        origin: request.nextUrl.origin,
      });
    } catch (mailError) {
      console.error("Booking decline admin email failed", {
        message: mailError instanceof Error ? mailError.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ok: true, status: result || decision });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
