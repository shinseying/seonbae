import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import ConsultationRequestList, { type AdminConsultationRequest } from "./ConsultationRequestList";
import AdminSidebar from "../AdminSidebar";
import styles from "./consultations.module.css";

export const dynamic = "force-dynamic";

export default async function AdminConsultationsPage() {
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
  // Scheduled parent consultations share this table; the inbox shows only
  // unscheduled inquiries (those without a Zoom meeting).
  const { data } = await admin
    .from("consultation_requests")
    .select("id,name,email,phone,curriculum,preferred_tutor,subject,goals,language,source,status,notification_sent_at,notification_error,created_at")
    .is("zoom_meeting_number", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const requests = (data ?? []) as AdminConsultationRequest[];
  const newCount = requests.filter((item) => item.status === "new").length;

  return (
    <main className={styles.page}>
      <AdminSidebar active="consultations" adminName={profile.full_name || profile.email || "관리자"} styles={styles} />
      <section className={styles.main}>
        <header className={styles.heading}><div><p>CONSULTATION INBOX</p><h1>상담 신청</h1><span>홈페이지에서 접수된 신청과 이메일 전송 상태를 확인합니다.</span></div><b>{newCount}건 신규</b></header>
        <ConsultationRequestList requests={requests} />
      </section>
    </main>
  );
}
