import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import ApplicationReviewClient, { type AccountApplication } from "./ApplicationReviewClient";
import AdminSidebar from "../AdminSidebar";
import { TUTOR_CONTRACT_VERSION } from "../../../utils/contracts/tutor-contract";
import styles from "./applications.module.css";

export const dynamic = "force-dynamic";

export default async function AdminApplicationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/portal");

  const admin = createAdminClient();
  const { data: accountRows } = await admin
    .from("account_creation_requests")
    .select("id,user_id,full_name,email,phone,requested_role,acceptance_letter_path,acceptance_letter_name,credential_path,credential_name,university,subjects,subject_scores,languages,lesson_format,curriculum,official_score,referral_code,status,notification_sent_at,notification_error,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // Applications without a user_id have not been provisioned yet, so there is
  // no contract to look up for them.
  const pendingTutorIds = (accountRows ?? [])
    .filter((item) => item.requested_role === "tutor" && item.user_id)
    .map((item) => item.user_id as string);
  const signedTutorIds = new Set<string>();
  if (pendingTutorIds.length) {
    const { data: signatures } = await admin
      .from("tutor_contract_signatures")
      .select("tutor_id")
      .in("tutor_id", pendingTutorIds)
      .eq("contract_version", TUTOR_CONTRACT_VERSION);
    for (const signature of signatures ?? []) signedTutorIds.add(signature.tutor_id);
  }

  const signUrl = async (path: string | null) => {
    if (!path) return null;
    const signed = await admin.storage.from("account-documents").createSignedUrl(path, 60 * 60);
    return signed.data?.signedUrl || null;
  };
  const accounts: AccountApplication[] = await Promise.all((accountRows ?? []).map(async (item) => ({
    ...item,
    contract_signed:
      item.requested_role !== "tutor"
      || !item.user_id
      || signedTutorIds.has(item.user_id),
    documentUrl: await signUrl(item.acceptance_letter_path),
    credentialUrl: await signUrl(item.credential_path),
    subject_scores: (Array.isArray(item.subject_scores) ? item.subject_scores : []).map((row) => ({
      subject: String(row?.subject ?? ""),
      score: String(row?.score ?? ""),
    })),
  })));
  return (
    <main className={styles.page}>
      <AdminSidebar active="applications" adminName={profile.full_name || profile.email || "관리자"} styles={styles} />
      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>ADMISSIONS DESK</p>
            <h1>가입 심사</h1>
            <span>대기 중인 가입 신청을 확인하고 승인, 반려, 삭제합니다.</span>
          </div>
          <b>{accounts.length}건 대기</b>
        </header>
        <ApplicationReviewClient accounts={accounts} />
      </section>
    </main>
  );
}
