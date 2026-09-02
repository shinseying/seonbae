import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import {
  buildTutorRow,
  isValidRegistryId,
  normalizeRegistryId,
  TUTOR_FIELDS,
} from "../../../../../utils/tutors/admin-card";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: { rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "가져올 튜터 카드가 없습니다." }, { status: 400 });
  }
  if (body.rows.length > 100) {
    return NextResponse.json({ error: "한 번에 최대 100명의 튜터만 가져올 수 있습니다." }, { status: 400 });
  }

  const seen = new Set<string>();
  const upserts: Array<Record<string, unknown>> = [];
  for (let index = 0; index < body.rows.length; index += 1) {
    const raw = body.rows[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: `${index + 2}행의 데이터 형식이 올바르지 않습니다.` }, { status: 400 });
    }

    const row = raw as Record<string, unknown>;
    const sourceRow = Number.isInteger(Number(row.sourceRow)) && Number(row.sourceRow) >= 2
      ? Number(row.sourceRow)
      : index + 2;
    const registryId = normalizeRegistryId(row.registry_id);
    if (!isValidRegistryId(registryId)) {
      return NextResponse.json({ error: `${sourceRow}행의 명부 번호를 확인해 주세요.` }, { status: 400 });
    }
    if (seen.has(registryId)) {
      return NextResponse.json({ error: `명부 번호 ${registryId}가 파일 안에서 중복되었습니다.` }, { status: 400 });
    }
    seen.add(registryId);

    const normalized = buildTutorRow(row);
    if (typeof normalized === "string") {
      return NextResponse.json({ error: `${sourceRow}행: ${normalized}` }, { status: 400 });
    }
    upserts.push({ ...normalized, registry_id: registryId });
  }

  // One bulk upsert is one PostgreSQL statement: if any row fails, none of the
  // cards are partially written. Existing registry IDs are deliberately shown
  // as updates in the preview before this request is sent.
  const { data, error } = await auth.supabase
    .from("tutors")
    .upsert(upserts, { onConflict: "registry_id" })
    .select(TUTOR_FIELDS);

  if (error) {
    console.error("[admin tutor import]", error);
    return NextResponse.json({ error: "튜터 카드를 일괄 저장하지 못했습니다." }, { status: 500 });
  }

  const tutors = (data ?? []).sort((left, right) =>
    left.display_order - right.display_order || left.registry_id.localeCompare(right.registry_id));
  return NextResponse.json({ tutors }, {
    status: 201,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
