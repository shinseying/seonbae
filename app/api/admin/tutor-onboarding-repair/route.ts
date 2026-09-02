import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { ensureTutorApplicationRecord } from "../../../../utils/tutors/application-link";

export const dynamic = "force-dynamic";

// Idempotent, account-scoped maintenance endpoint for tutors created before
// application-linked provisioning. Broad repairs belong in reviewed database
// migrations; this route requires the exact account email.
export async function POST(request: NextRequest) {
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

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "복구할 계정 이메일이 필요합니다." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "복구할 계정 이메일을 확인해 주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tutor, error } = await admin
    .from("profiles")
    .select("id,full_name,email,phone,role,account_status,account_reviewed_at")
    .eq("role", "tutor")
    .eq("account_status", "approved")
    .eq("email", email)
    .maybeSingle();
  if (error || !tutor) {
    return NextResponse.json({ error: "승인된 튜터 계정을 찾지 못했습니다." }, { status: 404 });
  }

  try {
    const result = await ensureTutorApplicationRecord(admin, tutor.id, tutor);
    return NextResponse.json(
      { ok: true, action: result.action },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { error: "튜터 가입 기록을 복구하지 못했습니다." },
      { status: 409 },
    );
  }
}
