import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import {
  buildTutorRow,
  cleanText,
  isValidRegistryId,
  normalizeRegistryId,
  TUTOR_FIELDS,
} from "../../../../utils/tutors/admin-card";

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

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("tutors")
    .select(TUTOR_FIELDS)
    .order("display_order", { ascending: true })
    .order("registry_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "튜터 명부를 불러오지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const registryId = cleanText(body.registry_id, 24);
  if (!registryId) {
    return NextResponse.json({ error: "명부 번호가 필요합니다." }, { status: 400 });
  }

  const updates = buildTutorRow(body);
  if (typeof updates === "string") {
    return NextResponse.json({ error: updates }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("tutors")
    .update(updates)
    .eq("registry_id", registryId)
    .select(TUTOR_FIELDS)
    .single();

  if (error) {
    return NextResponse.json({ error: "튜터 정보를 저장하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

// Adding a card. The admin fills in a blank card in the editor and picks its
// own registry number, so the id is validated here rather than generated: an
// existing number would otherwise silently overwrite a live tutor.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const registryId = normalizeRegistryId(body.registry_id);
  if (!isValidRegistryId(registryId)) {
    return NextResponse.json(
      { error: "명부 번호는 영문 대문자로 시작하고 영문·숫자·하이픈만 쓸 수 있습니다. 예: P-004" },
      { status: 400 },
    );
  }

  const insert = buildTutorRow(body);
  if (typeof insert === "string") {
    return NextResponse.json({ error: insert }, { status: 400 });
  }

  const { count } = await auth.supabase
    .from("tutors")
    .select("registry_id", { count: "exact", head: true })
    .eq("registry_id", registryId);
  if (count) {
    return NextResponse.json({ error: `명부 번호 ${registryId}는 이미 사용 중입니다.` }, { status: 409 });
  }

  const { data, error } = await auth.supabase
    .from("tutors")
    .insert({ ...insert, registry_id: registryId })
    .select(TUTOR_FIELDS)
    .single();

  if (error) {
    return NextResponse.json({ error: "튜터 카드를 만들지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json(data, {
    status: 201,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

// Removing a tutor deletes the public card. The row is only safe to delete
// while it has no history: the contract-signature FK blocks the delete
// outright, and homework, chat, and bookings would cascade away with it. When
// history exists the admin is pointed at the visibility toggle instead.
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const registryId = cleanText(request.nextUrl.searchParams.get("registry_id"), 24);
  if (!registryId) {
    return NextResponse.json({ error: "명부 번호가 필요합니다." }, { status: 400 });
  }

  const countFor = async (table: string, column: string) => {
    const { count } = await auth.supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, registryId);
    return count ?? 0;
  };

  const [sessions, assignments, threads, contracts] = await Promise.all([
    countFor("portal_sessions", "tutor_registry_id"),
    countFor("portal_assignments", "tutor_registry_id"),
    countFor("chat_threads", "tutor_registry_id"),
    countFor("tutor_contract_signatures", "tutor_registry_id"),
  ]);

  const blockers = [
    sessions && `수업 ${sessions}건`,
    assignments && `숙제 ${assignments}건`,
    threads && `대화 ${threads}건`,
    contracts && `계약 서명 ${contracts}건`,
  ].filter(Boolean);

  if (blockers.length) {
    return NextResponse.json(
      {
        error: `기록이 남아 있어 삭제할 수 없습니다 (${blockers.join(", ")}). 카드를 감추려면 ‘공개 명부에 표시’를 해제해 주세요.`,
      },
      { status: 409 },
    );
  }

  // The account keeps its tutor role after the registry row goes, so hand it
  // back to a plain student account before deleting the card.
  await auth.supabase
    .from("profiles")
    .update({
      role: "student",
      tutor_registry_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tutor_registry_id", registryId)
    .neq("role", "admin");

  const { error } = await auth.supabase
    .from("tutors")
    .delete()
    .eq("registry_id", registryId);

  if (error) {
    return NextResponse.json({ error: "튜터를 삭제하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json(
    { deleted: registryId },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
