import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function token(length: number) {
  return Array.from(randomBytes(length), (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

// A tutor opens a classroom before anyone is matched into it. The cap is on the
// tutor row so an admin can raise it for one tutor without touching the rest.
export async function POST(request: NextRequest) {
  const auth = await requireTutor();
  if ("error" in auth) return auth.error;

  let body: { title?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
  if (title.length < 2) return error("교실 이름을 입력해 주세요.", 400);

  const admin = auth.admin;
  const [{ data: tutor }, { count }] = await Promise.all([
    admin.from("tutors").select("classroom_limit").eq("registry_id", auth.registryId).single(),
    admin
      .from("classrooms")
      .select("id", { count: "exact", head: true })
      .eq("tutor_registry_id", auth.registryId),
  ]);

  const limit = tutor?.classroom_limit ?? 3;
  if ((count ?? 0) >= limit) {
    return error(`교실은 최대 ${limit}개까지 만들 수 있습니다. 추가가 필요하면 관리자에게 요청해 주세요.`, 409);
  }

  const { data, error: writeError } = await admin
    .from("classrooms")
    .insert({
      join_code: `C-${token(6)}`,
      join_password: token(8),
      tutor_registry_id: auth.registryId,
      student_id: null,
      title,
    })
    .select("id,join_code,join_password,title")
    .single();
  if (writeError || !data) return error("교실을 만들지 못했습니다.", 500);

  return NextResponse.json(data, { status: 201 });
}

// Asking an admin for room beyond the cap.
export async function PUT(request: NextRequest) {
  const auth = await requireTutor();
  if ("error" in auth) return auth.error;

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (reason.length < 2) return error("추가가 필요한 이유를 적어 주세요.", 400);

  // One open request at a time, so the admin queue holds one row per tutor.
  const { data: open } = await auth.admin
    .from("classroom_slot_requests")
    .select("id")
    .eq("tutor_registry_id", auth.registryId)
    .eq("status", "pending")
    .maybeSingle();

  const row = {
    tutor_registry_id: auth.registryId,
    requested_by: auth.userId,
    reason,
    status: "pending",
    updated_at: new Date().toISOString(),
  };
  const { error: writeError } = open
    ? await auth.admin.from("classroom_slot_requests").update(row).eq("id", open.id)
    : await auth.admin.from("classroom_slot_requests").insert(row);
  if (writeError) return error("요청을 저장하지 못했습니다.", 500);

  return NextResponse.json({ ok: true, replaced: Boolean(open) });
}

async function requireTutor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: error("로그인이 필요합니다.", 401) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status,tutor_registry_id")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "tutor" || profile.account_status !== "approved" || !profile.tutor_registry_id) {
    return { error: error("튜터 권한이 필요합니다.", 403) };
  }

  try {
    return { admin: createAdminClient(), registryId: profile.tutor_registry_id, userId: user.id };
  } catch {
    return { error: error("교실 시스템이 아직 설정되지 않았습니다.", 503) };
  }
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
