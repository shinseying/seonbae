import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { parseProfile } from "../../../../utils/tutors/profile-patch";

export const dynamic = "force-dynamic";

const tutorFields =
  "registry_id,name,exam,score,category,tier,university,university_en,photo_url,banner_url,zoom_host_email,display_order,active,subject_scores,availability,bio,bio_en,video_url,languages,lesson_format";

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
    .select(tutorFields)
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

  const category = cleanText(body.category, 20);
  const tier = cleanText(body.tier, 20);
  const displayOrder = Number(body.display_order);
  const allowedCategories = new Set(["ib", "ap", "alevel", "sat", "english"]);
  const allowedTiers = new Set(["premium", "standard"]);

  if (!allowedCategories.has(category) || !allowedTiers.has(tier)) {
    return NextResponse.json({ error: "분류 또는 등급 값이 올바르지 않습니다." }, { status: 400 });
  }

  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
    return NextResponse.json({ error: "표시 순서는 0~9999 사이의 정수여야 합니다." }, { status: 400 });
  }

  const existingTutor = await auth.supabase
    .from("tutors")
    .select("zoom_host_email")
    .eq("registry_id", registryId)
    .single();
  const zoomHostEmailInput = cleanText(body.zoom_host_email, 254).toLowerCase();
  if (
    zoomHostEmailInput
    && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(zoomHostEmailInput)
  ) {
    return NextResponse.json(
      { error: "Zoom 호스트 이메일 형식을 확인해 주세요." },
      { status: 400 },
    );
  }
  const zoomHostEmail = zoomHostEmailInput || null;

  // Same profile fields the tutor edits themselves, so an admin can correct a
  // card without asking. Returns a message string when a value is malformed.
  const profilePatch = parseProfile(body);
  if (typeof profilePatch === "string") {
    return NextResponse.json({ error: profilePatch }, { status: 400 });
  }

  const updates = {
    ...profilePatch,
    name: cleanText(body.name, 80),
    exam: cleanText(body.exam, 80),
    score: cleanText(body.score, 80),
    category,
    tier,
    university: nullableText(body.university, 120),
    university_en: nullableText(body.university_en, 160),
    photo_url: safeAssetUrl(body.photo_url),
    banner_url: safeAssetUrl(body.banner_url),
    zoom_host_email: zoomHostEmail,
    display_order: displayOrder,
    active: body.active === true,
    updated_at: new Date().toISOString(),
  };

  if (!updates.name || !updates.exam || !updates.score) {
    return NextResponse.json({ error: "이름, 시험, 성적을 모두 입력해 주세요." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("tutors")
    .update(updates)
    .eq("registry_id", registryId)
    .select(tutorFields)
    .single();

  if (error) {
    return NextResponse.json({ error: "튜터 정보를 저장하지 못했습니다." }, { status: 500 });
  }

  const previousHostEmail = existingTutor.data?.zoom_host_email;
  if (
    previousHostEmail
    && previousHostEmail.toLowerCase() !== zoomHostEmail?.toLowerCase()
  ) {
    await auth.supabase
      .from("profiles")
      .update({
        role: "student",
        tutor_registry_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tutor_registry_id", registryId)
      .neq("role", "admin");
  }

  if (zoomHostEmail) {
    await auth.supabase
      .from("profiles")
      .update({
        role: "tutor",
        tutor_registry_id: registryId,
        updated_at: new Date().toISOString(),
      })
      .ilike("email", zoomHostEmail)
      .neq("role", "admin");
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const text = cleanText(value, maxLength);
  return text || null;
}

function safeAssetUrl(value: unknown) {
  const text = cleanText(value, 500);
  if (!text) return null;
  if (text.startsWith("/")) return text;

  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
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
