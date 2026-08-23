import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { parseProfile } from "../../../../utils/tutors/profile-patch";

export const dynamic = "force-dynamic";

// A tutor edits their own card: availability, per-subject scores, bio, video.
// Admins edit the same fields through /api/admin/tutors.
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const patch = parseProfile(body);
  if (typeof patch === "string") return error(patch, 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("프로필 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { error: updateError } = await admin
    .from("tutors")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("registry_id", profile.tutor_registry_id);

  if (updateError) return error("프로필을 저장하지 못했습니다.", 500);
  return NextResponse.json({ ok: true });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
