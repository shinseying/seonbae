import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

// A signed-in user (typically a parent) files a complaint. It lands in the
// admin portal via the complaints table; RLS scopes reads to author + admin.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (text.length < 2) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }

  const { error } = await supabase
    .from("complaints")
    .insert({ user_id: user.id, body: text });
  if (error) {
    return NextResponse.json({ error: "접수하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// Admin marks a complaint resolved (or reopens it) and can leave a note.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  let body: { id?: unknown; status?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const id = Number(body.id);
  const status = body.status === "resolved" ? "resolved" : body.status === "new" ? "new" : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (!Number.isInteger(id) || !status) {
    return NextResponse.json({ error: "요청을 확인하지 못했습니다." }, { status: 400 });
  }

  const { error } = await supabase
    .from("complaints")
    .update({
      status,
      admin_note: note || null,
      handled_by: status === "resolved" ? user.id : null,
      handled_at: status === "resolved" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "처리하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
