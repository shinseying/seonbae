import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";

// An admin grants a tutor room beyond the default cap, or declines. Approving
// raises that tutor's classroom_limit by the number granted.
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

  let body: { id?: unknown; decision?: unknown; granted?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const id = Number(body.id);
  const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : null;
  const granted = Number.isInteger(Number(body.granted))
    ? Math.min(10, Math.max(1, Number(body.granted)))
    : 1;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (!Number.isInteger(id) || !decision) return error("요청을 확인하지 못했습니다.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("교실 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: row } = await admin
    .from("classroom_slot_requests")
    .select("id,tutor_registry_id,status")
    .eq("id", id)
    .single();
  if (!row) return error("요청을 찾지 못했습니다.", 404);
  if (row.status !== "pending") return error("이미 처리된 요청입니다.", 409);

  if (decision === "approved") {
    const { data: tutor } = await admin
      .from("tutors")
      .select("classroom_limit")
      .eq("registry_id", row.tutor_registry_id)
      .single();
    const { error: limitError } = await admin
      .from("tutors")
      .update({
        classroom_limit: (tutor?.classroom_limit ?? 3) + granted,
        updated_at: new Date().toISOString(),
      })
      .eq("registry_id", row.tutor_registry_id);
    if (limitError) return error("교실 한도를 올리지 못했습니다.", 500);
  }

  const { error: writeError } = await admin
    .from("classroom_slot_requests")
    .update({
      status: decision,
      granted: decision === "approved" ? granted : null,
      review_note: note || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (writeError) return error("처리 결과를 저장하지 못했습니다.", 500);

  return NextResponse.json({ ok: true });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
