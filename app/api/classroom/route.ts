import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

// A parent joins a classroom with the code and password the tutor gives them.
// The request waits until the tutor accepts it.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.account_status !== "approved") {
    return error("승인된 계정만 교실에 참여할 수 있습니다.", 403);
  }
  if (profile.role !== "parent" && profile.role !== "student") {
    return error("보호자 또는 학생 계정만 교실에 참여할 수 있습니다.", 403);
  }

  let body: { code?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const code = text(body.code, 24).toUpperCase();
  const password = text(body.password, 32).toUpperCase();
  if (!code || !password) return error("교실 ID와 비밀번호를 입력해 주세요.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("교실 시스템이 아직 설정되지 않았습니다.", 503);
  }

  const { data: classroom } = await admin
    .from("classrooms")
    .select("id,student_id,join_password")
    .eq("join_code", code)
    .maybeSingle();

  // One message for a wrong code and a wrong password, so the pair cannot be
  // probed one half at a time.
  if (!classroom || classroom.join_password.toUpperCase() !== password) {
    return error("교실 ID 또는 비밀번호가 올바르지 않습니다.", 404);
  }
  if (classroom.student_id === user.id) {
    return error("이미 이 교실의 학생입니다.", 409);
  }

  const { data: existing } = await admin
    .from("classroom_members")
    .select("id,status")
    .eq("classroom_id", classroom.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.status === "approved") return error("이미 참여 중인 교실입니다.", 409);
  if (existing?.status === "pending") {
    return NextResponse.json({ ok: true, status: "pending", alreadyRequested: true });
  }

  const row = {
    classroom_id: classroom.id,
    user_id: user.id,
    role: profile.role,
    status: "pending",
    requested_at: new Date().toISOString(),
    decided_at: null,
    decided_by: null,
  };
  const { error: writeError } = existing
    ? await admin.from("classroom_members").update(row).eq("id", existing.id)
    : await admin.from("classroom_members").insert(row);
  if (writeError) return error("참여 요청을 저장하지 못했습니다.", 500);

  return NextResponse.json({ ok: true, status: "pending" }, { status: 201 });
}

// The tutor who owns the classroom accepts or declines a request.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,tutor_registry_id")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "tutor" || !profile.tutor_registry_id) {
    return error("튜터만 참여 요청을 처리할 수 있습니다.", 403);
  }

  let body: { id?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("요청 형식이 올바르지 않습니다.", 400);
  }

  const id = Number(body.id);
  const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : null;
  if (!Number.isInteger(id) || !decision) return error("요청을 확인하지 못했습니다.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("교실 시스템이 아직 설정되지 않았습니다.", 503);
  }

  // The tutor may only decide requests for their own classrooms.
  const { data: member } = await admin
    .from("classroom_members")
    .select("id,classroom_id,classrooms(tutor_registry_id)")
    .eq("id", id)
    .single();
  const classroom = Array.isArray(member?.classrooms) ? member?.classrooms[0] : member?.classrooms;
  if (!member || classroom?.tutor_registry_id !== profile.tutor_registry_id) {
    return error("이 교실의 참여 요청이 아닙니다.", 403);
  }

  const { error: writeError } = await admin
    .from("classroom_members")
    .update({ status: decision, decided_at: new Date().toISOString(), decided_by: user.id })
    .eq("id", id);
  if (writeError) return error("처리 결과를 저장하지 못했습니다.", 500);

  return NextResponse.json({ ok: true, status: decision });
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
