import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (error || profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }) };
  }
  return { supabase };
}

// Who owns a tutor card. Assigning is the deliberate replacement for the old
// behaviour, where handle_new_user() handed the card to whoever happened to
// register the address sitting in zoom_host_email.
//
// PATCH { registry_id, profile_id }        -> assign the card to that account
// PATCH { registry_id, profile_id: null }  -> unassign, leaving the card unowned
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const registryId = typeof body.registry_id === "string" ? body.registry_id.trim().slice(0, 24) : "";
  if (!registryId) {
    return NextResponse.json({ error: "명부 번호가 필요합니다." }, { status: 400 });
  }

  const profileId = typeof body.profile_id === "string" && body.profile_id.trim()
    ? body.profile_id.trim()
    : null;

  const { data: card } = await supabase
    .from("tutors")
    .select("registry_id,name")
    .eq("registry_id", registryId)
    .single();
  if (!card) {
    return NextResponse.json({ error: "튜터 카드를 찾지 못했습니다." }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Release the account currently holding this card. It runs for an unassign
  // and before a reassign, so a card is never claimed by two profiles.
  const release = await supabase
    .from("profiles")
    .update({ role: "student", tutor_registry_id: null, updated_at: now })
    .eq("tutor_registry_id", registryId)
    .neq("role", "admin");
  if (release.error) {
    return NextResponse.json({ error: "기존 연결을 해제하지 못했습니다." }, { status: 500 });
  }

  if (!profileId) {
    return NextResponse.json({ registry_id: registryId, profile: null }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,tutor_registry_id")
    .eq("id", profileId)
    .single();
  if (!target) {
    return NextResponse.json({ error: "계정을 찾지 못했습니다." }, { status: 404 });
  }
  if (target.role === "admin") {
    return NextResponse.json({ error: "관리자 계정에는 튜터 카드를 연결할 수 없습니다." }, { status: 409 });
  }
  if (target.tutor_registry_id && target.tutor_registry_id !== registryId) {
    return NextResponse.json(
      { error: `이 계정은 이미 ${target.tutor_registry_id} 카드에 연결되어 있습니다. 먼저 그 카드에서 연결을 해제해 주세요.` },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: "tutor", tutor_registry_id: registryId, updated_at: now })
    .eq("id", profileId)
    .select("id,full_name,email,role")
    .single();
  if (error) {
    return NextResponse.json({ error: "카드를 계정에 연결하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ registry_id: registryId, profile: data }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
