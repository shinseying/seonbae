import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const admin = createAdminClient();

  const recentLessonCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [applications, tutorAccounts, bookings, cards, slots, sessions, consultations, complaints] = await Promise.all([
    count(admin.from("account_creation_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(admin.from("account_creation_requests").select("id", { count: "exact", head: true }).eq("requested_role", "tutor").is("user_id", null).neq("status", "rejected")),
    count(admin.from("booking_requests").select("id", { count: "exact", head: true }).eq("status", "new")),
    count(admin.from("tutor_profile_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(admin.from("classroom_slot_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(admin.from("portal_sessions").select("id", { count: "exact", head: true }).gte("updated_at", recentLessonCutoff)),
    count(admin.from("consultation_requests").select("id", { count: "exact", head: true }).eq("status", "new")),
    count(admin.from("complaints").select("id", { count: "exact", head: true }).eq("status", "new")),
  ]);

  return NextResponse.json({
    applications,
    "tutor-accounts": tutorAccounts,
    bookings,
    "card-requests": cards,
    "classroom-slots": slots,
    sessions,
    consultations,
    complaints,
  }, noStore());
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: error("로그인이 필요합니다.", 401) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { response: error("관리자 권한이 필요합니다.", 403) };
  return { user };
}

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, ...noStore() });
}

function noStore() {
  return { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } };
}
