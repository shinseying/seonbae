import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { ensureTutorApplicationRecord } from "../../../../utils/tutors/application-link";

export const dynamic = "force-dynamic";

// Idempotent maintenance endpoint for tutor accounts created before
// application-linked provisioning. It repairs only already-approved tutors and
// returns counts rather than personal data.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: reviewer } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (reviewer?.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: tutors, error } = await admin
    .from("profiles")
    .select("id,full_name,email,phone,role,account_status,account_reviewed_at")
    .eq("role", "tutor")
    .eq("account_status", "approved")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "튜터 계정을 불러오지 못했습니다." }, { status: 500 });
  }

  const summary = { checked: tutors?.length ?? 0, existing: 0, linked: 0, created: 0, failed: 0 };
  const failedUserIds: string[] = [];
  for (const tutor of tutors ?? []) {
    try {
      const result = await ensureTutorApplicationRecord(admin, tutor.id, tutor);
      summary[result.action] += 1;
    } catch {
      summary.failed += 1;
      failedUserIds.push(tutor.id);
    }
  }

  return NextResponse.json(
    { ok: summary.failed === 0, ...summary, failedUserIds },
    {
      status: summary.failed === 0 ? 200 : 409,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}
