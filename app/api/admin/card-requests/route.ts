import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";

// An admin applies a tutor's requested card change, or rejects it with a note.
// Applying copies the stored payload straight onto the registry row.
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

  let body: { id?: unknown; decision?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const id = Number(body.id);
  const decision = body.decision === "applied" ? "applied" : body.decision === "rejected" ? "rejected" : null;
  const reviewNote = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";

  if (!Number.isInteger(id) || !decision) return error("요청을 확인하지 못했습니다.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("변경 요청 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: row } = await admin
    .from("tutor_profile_requests")
    .select("id,tutor_registry_id,payload,status")
    .eq("id", id)
    .single();

  if (!row) return error("변경 요청을 찾지 못했습니다.", 404);
  if (row.status !== "pending") return error("이미 처리된 요청입니다.", 409);

  if (decision === "applied") {
    const { error: applyError } = await admin
      .from("tutors")
      .update({ ...(row.payload as Record<string, unknown>), updated_at: new Date().toISOString() })
      .eq("registry_id", row.tutor_registry_id);
    if (applyError) return error("카드에 반영하지 못했습니다.", 500);
  }

  const { error: closeError } = await admin
    .from("tutor_profile_requests")
    .update({
      status: decision,
      review_note: reviewNote || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      seen_by_admin: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (closeError) return error("처리 결과를 저장하지 못했습니다.", 500);
  return NextResponse.json({ ok: true });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
