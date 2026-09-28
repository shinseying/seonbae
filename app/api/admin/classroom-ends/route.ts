import { NextRequest, NextResponse } from "next/server";
import { endClassroomMatch } from "../../../../utils/classrooms/match-end";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";
// Ending cancels each future lesson's Zoom meeting in turn.
export const maxDuration = 60;

// Approve or reject an end request. Approving ends the match.
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: { requestId?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }
  const requestId = Number(body.requestId);
  const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : null;
  if (!Number.isSafeInteger(requestId) || !decision) return error("요청과 결정을 확인해 주세요.", 400);

  const { data: endRequest } = await auth.admin
    .from("classroom_end_requests")
    .select("id,classroom_id,reason,status")
    .eq("id", requestId)
    .maybeSingle();
  if (!endRequest) return error("종료 요청을 찾지 못했습니다.", 404);
  if (endRequest.status !== "pending") return error("이미 처리된 종료 요청입니다.", 409);

  if (decision === "approved") {
    const ended = await endClassroomMatch(auth.admin, {
      classroomId: endRequest.classroom_id,
      endedBy: auth.userId,
      reason: endRequest.reason,
    });
    if ("error" in ended) return error(ended.error, ended.status);
    await markDecided(auth.admin, endRequest.id, "approved", auth.userId);
    return NextResponse.json({ ok: true, ...ended });
  }

  await markDecided(auth.admin, endRequest.id, "rejected", auth.userId);
  return NextResponse.json({ ok: true });
}

// The admin ends a match directly, with or without a request on file.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: { classroomId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }
  const classroomId = Number(body.classroomId);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!Number.isSafeInteger(classroomId) || classroomId < 1) return error("교실을 확인해 주세요.", 400);

  const ended = await endClassroomMatch(auth.admin, {
    classroomId,
    endedBy: auth.userId,
    reason: reason || null,
  });
  if ("error" in ended) return error(ended.error, ended.status);

  // A request that was still open is answered by this end.
  const { data: open } = await auth.admin
    .from("classroom_end_requests")
    .select("id")
    .eq("classroom_id", classroomId)
    .eq("status", "pending")
    .maybeSingle();
  if (open) await markDecided(auth.admin, open.id, "approved", auth.userId);

  return NextResponse.json({ ok: true, ...ended });
}

async function markDecided(
  admin: ReturnType<typeof createAdminClient>,
  id: number,
  status: "approved" | "rejected",
  reviewer: string,
) {
  await admin
    .from("classroom_end_requests")
    .update({ status, reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: error("로그인이 필요합니다.", 401) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: error("관리자 권한이 필요합니다.", 403) };
  try {
    return { admin: createAdminClient(), userId: user.id };
  } catch {
    return { error: error("교실 시스템이 아직 설정되지 않았습니다.", 503) };
  }
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
