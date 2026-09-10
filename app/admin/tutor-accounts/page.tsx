import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import AdminSidebar from "../AdminSidebar";
import TutorAccountCreator, { type PendingTutorApplication } from "./TutorAccountCreator";
import { type AvailableTutorCard } from "./TutorCardChoiceFields";
import styles from "../applications/applications.module.css";

export const dynamic = "force-dynamic";

// Admins provision approved tutor logins from an application or from details
// they already hold. Card ownership is chosen explicitly during provisioning.
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
  const [{ data: rows }, { data: tutorRows }, { data: linkedProfiles }] = await Promise.all([
    admin
      .from("account_creation_requests")
      .select("id,full_name,email,phone,university,subjects,created_at")
      .eq("requested_role", "tutor")
      .is("user_id", null)
      .neq("status", "rejected")
      .order("created_at", { ascending: true }),
    admin
      .from("tutors")
      .select("registry_id,name,university,exam,active,display_order")
      .order("display_order", { ascending: true })
      .order("registry_id", { ascending: true }),
    admin
      .from("profiles")
      .select("tutor_registry_id")
      .not("tutor_registry_id", "is", null),
  ]);

  const applications = (rows ?? []) as PendingTutorApplication[];
  const linkedRegistryIds = new Set(
    (linkedProfiles ?? [])
      .map((row) => row.tutor_registry_id)
      .filter((value): value is string => Boolean(value)),
  );
  const availableCards = (tutorRows ?? [])
    .filter((card) => !linkedRegistryIds.has(card.registry_id)) as AvailableTutorCard[];

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
            <span>계정 생성 전 새 카드를 만들지, 기존 미연결 카드에 연결할지 선택합니다. 완료 후 비밀번호 설정 링크가 발송됩니다.</span>
          </div>
          <b>{applications.length}건 대기</b>
        </header>
        <TutorAccountCreator applications={applications} availableCards={availableCards} />
      </section>
    </main>
  );
}
