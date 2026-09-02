import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { parseProfile } from "../../../../utils/tutors/profile-patch";
import { sendAdminEventEmail } from "../../../../utils/email/admin-event";

export const dynamic = "force-dynamic";

// Tutors no longer edit their card directly. They submit the change they want
// and an admin applies it, so the public card and the registry never diverge.
export async function POST(request: NextRequest) {
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

  const payload = parseProfile(body);
  if (typeof payload === "string") return error(payload, 400);

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return error("변경 요청 시스템이 아직 설정되지 않았습니다.", 503);
  }

  // One open request at a time. A second submission replaces the first rather
  // than queueing two versions of the same card for the admin to reconcile.
  const { data: open } = await admin
    .from("tutor_profile_requests")
    .select("id")
    .eq("tutor_registry_id", profile.tutor_registry_id)
    .eq("status", "pending")
    .maybeSingle();

  const row = {
    tutor_registry_id: profile.tutor_registry_id,
    requested_by: user.id,
    payload,
    note: note || null,
    status: "pending",
    seen_by_admin: false,
    updated_at: new Date().toISOString(),
  };

  const updatedAt = row.updated_at;
  const { data: saved, error: writeError } = open
    ? await admin.from("tutor_profile_requests").update(row).eq("id", open.id).select("id").single()
    : await admin.from("tutor_profile_requests").insert(row).select("id").single();

  if (writeError || !saved) return error("변경 요청을 저장하지 못했습니다.", 500);
  try {
    await sendAdminEventEmail({
      eventKey: `card-${saved.id}-${Date.parse(updatedAt)}`,
      eyebrow: "Seonbae tutor card",
      heading: open ? "튜터 카드 변경 요청이 수정되었습니다." : "새 튜터 카드 변경 요청이 도착했습니다.",
      subject: `[선배 관리자] 카드 변경 요청 · ${profile.tutor_registry_id}`,
      rows: [
        ["튜터", profile.tutor_registry_id],
        ["요청 번호", String(saved.id)],
        ["변경 항목", Object.keys(payload).join(", ") || "프로필 정보"],
      ],
      ...(note ? { note: { title: "튜터 메모", body: note } } : {}),
      portalPath: "/admin/card-requests",
      origin: request.nextUrl.origin,
    });
  } catch (mailError) {
    console.error("Tutor card admin email failed", {
      message: mailError instanceof Error ? mailError.message : "Unknown error",
    });
  }
  return NextResponse.json({ ok: true, replaced: Boolean(open) });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
