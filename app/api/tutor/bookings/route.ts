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

  return NextResponse.json({ ok: true, status: result || decision });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
