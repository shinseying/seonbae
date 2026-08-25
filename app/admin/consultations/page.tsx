import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import ConsultationRequestList, {
  type AdminConsultationRequest,
  type AdminScheduledConsultation,
} from "./ConsultationRequestList";
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
  // Inquiries and scheduled consultations are the same row at two stages, so
  // both are read here and the page manages the whole life cycle.
  const columns =
    "id,name,email,phone,curriculum,preferred_tutor,preferred_times,subject,goals,language,source,status,notification_sent_at,notification_error,created_at";
  const [{ data: inbox }, { data: booked }] = await Promise.all([
    admin
      .from("consultation_requests")
      .select(columns)
      .is("zoom_meeting_number", null)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("consultation_requests")
      .select(`${columns},user_id,session_date,starts_at,duration_minutes,meeting_title,notes,zoom_meeting_number,zoom_status`)
      .not("zoom_meeting_number", "is", null)
      .order("session_date", { ascending: false })
      .order("starts_at", { ascending: false })
      .limit(100),
  ]);
  const requests = (inbox ?? []) as AdminConsultationRequest[];
  const scheduled = (booked ?? []) as AdminScheduledConsultation[];
  const newCount = requests.filter((item) => item.status === "new").length;

  return (
    <main className={styles.page}>
      <AdminSidebar active="consultations" adminName={profile.full_name || profile.email || "관리자"} styles={styles} />
      <section className={styles.main}>
        <header className={styles.heading}><div><p>CONSULTATIONS</p><h1>상담 신청 · 일정</h1><span>접수된 신청을 확인하고, 바로 상담 일정을 확정합니다.</span></div><b>{newCount}건 신규 · 일정 {scheduled.length}건</b></header>
        <ConsultationRequestList requests={requests} scheduled={scheduled} />
      </section>
    </main>
  );
}
