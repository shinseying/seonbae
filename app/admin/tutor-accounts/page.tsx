import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import AdminSidebar from "../AdminSidebar";
import TutorAccountCreator, { type PendingTutorApplication } from "./TutorAccountCreator";
import styles from "../applications/applications.module.css";

export const dynamic = "force-dynamic";

// Tutors cannot sign themselves up, so this is the only place a tutor login is
// created. Either from a reviewed application or straight from the admin's own
// details.
export default async function AdminTutorAccountsPage() {
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
    .select("id,full_name,email,phone,university,subjects,created_at")
    .eq("requested_role", "tutor")
    .is("user_id", null)
    .neq("status", "rejected")
    .order("created_at", { ascending: true });

  const applications = (rows ?? []) as PendingTutorApplication[];

  return (
    <main className={styles.page}>
      <AdminSidebar
        active="tutor-accounts"
        adminName={profile.full_name || profile.email || "관리자"}
        styles={styles}
      />
      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>TUTOR PROVISIONING</p>
            <h1>튜터 계정 생성</h1>
            <span>계정을 만들면 본인만 사용할 수 있는 일회용 비밀번호 설정 링크가 이메일로 발송됩니다.</span>
          </div>
          <b>{applications.length}건 대기</b>
        </header>
        <TutorAccountCreator applications={applications} />
      </section>
    </main>
  );
}
