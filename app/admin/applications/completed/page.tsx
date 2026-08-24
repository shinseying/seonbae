import { redirect } from "next/navigation";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import AdminSidebar from "../../AdminSidebar";
import CompletedApplicationList, { type CompletedApplication } from "./CompletedApplicationList";
import styles from "../applications.module.css";

export const dynamic = "force-dynamic";

// Applications leave the review queue once decided. They stay here so the team
// can look up who was approved or rejected, and why, without reopening the
// pending desk.
export default async function AdminCompletedApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/portal");

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("account_creation_requests")
    .select(
      "id,user_id,full_name,email,phone,requested_role,university,subjects,curriculum,official_score,status,review_note,reviewed_at,reviewed_by,created_at",
    )
    .neq("status", "pending")
    .order("reviewed_at", { ascending: false })
    .limit(200);

  const reviewerIds = Array.from(
    new Set((rows ?? []).map((row) => row.reviewed_by).filter(Boolean) as string[]),
  );
  const reviewerNames = new Map<string, string>();
  if (reviewerIds.length) {
    const { data: reviewers } = await admin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", reviewerIds);
    for (const reviewer of reviewers ?? []) {
      reviewerNames.set(reviewer.id, reviewer.full_name || reviewer.email || "관리자");
    }
  }

  // A tutor who was approved has a registry row; showing it lets the admin jump
  // straight to the card the application produced.
  const tutorUserIds = (rows ?? [])
    .filter((row) => row.requested_role === "tutor" && row.user_id)
    .map((row) => row.user_id as string);
  const registryIds = new Map<string, string>();
  if (tutorUserIds.length) {
    const { data: tutorProfiles } = await admin
      .from("profiles")
      .select("id,tutor_registry_id")
      .in("id", tutorUserIds);
    for (const tutorProfile of tutorProfiles ?? []) {
      if (tutorProfile.tutor_registry_id) {
        registryIds.set(tutorProfile.id, tutorProfile.tutor_registry_id);
      }
    }
  }

  const applications: CompletedApplication[] = (rows ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.requested_role,
    university: row.university,
    subjects: row.subjects,
    curriculum: row.curriculum,
    officialScore: row.official_score,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    reviewerName: row.reviewed_by ? reviewerNames.get(row.reviewed_by) || "관리자" : null,
    registryId: row.user_id ? registryIds.get(row.user_id) || null : null,
    createdAt: row.created_at,
  }));

  const approved = applications.filter((item) => item.status === "approved").length;

  return (
    <main className={styles.page}>
      <AdminSidebar
        active="completed-applications"
        adminName={profile.full_name || profile.email || "관리자"}
        styles={styles}
      />
      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>ADMISSIONS ARCHIVE</p>
            <h1>완료된 가입 신청</h1>
            <span>심사가 끝난 신청 기록입니다. 승인 결과와 심사 메모를 확인할 수 있습니다.</span>
          </div>
          <b>승인 {approved} · 전체 {applications.length}</b>
        </header>
        <CompletedApplicationList applications={applications} />
      </section>
    </main>
  );
}
