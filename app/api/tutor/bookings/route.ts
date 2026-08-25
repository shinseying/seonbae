import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

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

  const { data: booking } = await admin
    .from("booking_requests")
    .select("id,tutor_registry_id,requester_id,forwarded_at,status")
    .eq("id", id)
    .single();
  if (!booking || booking.tutor_registry_id !== profile.tutor_registry_id) {
    return error("이 매칭 요청을 처리할 수 없습니다.", 403);
  }
  // Only what the admin passed on is the tutor's to answer.
  if (!booking.forwarded_at) return error("아직 전달되지 않은 요청입니다.", 409);

  const decidedAt = new Date().toISOString();

  if (decision === "declined") {
    await admin
      .from("booking_requests")
      .update({ status: "declined", decided_at: decidedAt })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "declined" });
  }

  const { data: classroom } = await admin
    .from("classrooms")
    .select("id,tutor_registry_id,student_id")
    .eq("id", classroomId)
    .single();
  if (!classroom || classroom.tutor_registry_id !== profile.tutor_registry_id) {
    return error("본인 교실만 배정할 수 있습니다.", 403);
  }

  if (booking.requester_id) {
    const { data: requester } = await admin
      .from("profiles")
      .select("id,role")
      .eq("id", booking.requester_id)
      .single();

    if (requester?.role === "student") {
      if (classroom.student_id && classroom.student_id !== requester.id) {
        return error("이 교실에는 이미 다른 학생이 배정되어 있습니다.", 409);
      }
      const { error: seatError } = await admin
        .from("classrooms")
        .update({ student_id: requester.id, updated_at: decidedAt })
        .eq("id", classroom.id);
      if (seatError) return error("학생을 교실에 배정하지 못했습니다.", 500);
    } else if (requester) {
      const { error: memberError } = await admin
        .from("classroom_members")
        .upsert(
          {
            classroom_id: classroom.id,
            user_id: requester.id,
            role: requester.role === "parent" ? "parent" : "student",
            status: "approved",
            decided_at: decidedAt,
            decided_by: user.id,
          },
          { onConflict: "classroom_id,user_id" },
        );
      if (memberError) return error("교실에 참여시키지 못했습니다.", 500);
    }
  }

  await admin
    .from("booking_requests")
    .update({ status: "accepted", decided_at: decidedAt, classroom_id: classroom.id, seen_by_tutor: true })
    .eq("id", id);

  return NextResponse.json({ ok: true, status: "accepted" });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
