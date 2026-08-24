import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { zoomConfigurationStatus } from "../../../utils/zoom/server";
import AdminSidebar from "../AdminSidebar";
import AdminConsultationPanel, {
  type AdminConsultation,
  type AdminFamilyLink,
  type AdminParent,
} from "../sessions/AdminConsultationPanel";
import styles from "../sessions/sessions.module.css";

export const dynamic = "force-dynamic";

// Parent and founding-team consultations used to share the Zoom lesson page.
// They are a separate job, so they get a separate tab.
export default async function AdminConsultationSessionsPage() {
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

  const [{ data: parents }, { data: students }, { data: consultations }, { data: familyLinks }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("role", "parent")
        .order("full_name", { ascending: true }),
      supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("role", "student")
        .order("full_name", { ascending: true }),
      supabase
        .from("consultation_requests")
        .select(
          "id,user_id,session_date,starts_at,duration_minutes,actual_minutes,subject,meeting_title,notes,zoom_meeting_number,zoom_status",
        )
        .not("zoom_meeting_number", "is", null)
        .order("session_date", { ascending: false })
        .order("starts_at", { ascending: false })
        .limit(100),
      supabase.from("parent_student_links").select("parent_id,student_id"),
    ]);

  const zoomConfigured = zoomConfigurationStatus().configured;

  const mappedConsultations = (consultations ?? []).map((row) => ({
    id: row.id,
    parent_id: row.user_id,
    session_date: row.session_date,
    starts_at: row.starts_at,
    duration_minutes: row.duration_minutes,
    actual_minutes: row.actual_minutes ?? null,
    topic: row.subject,
    title: row.meeting_title,
    notes: row.notes,
    zoom_meeting_number: row.zoom_meeting_number,
    zoom_status: row.zoom_status,
  }));

  return (
    <main className={styles.page}>
      <AdminSidebar
        active="consultation-sessions"
        adminName={profile.full_name || profile.email || user.email || "관리자"}
        styles={styles}
      />
      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>PARENT CONSULTATIONS</p>
            <h1>보호자 상담 일정</h1>
            <span>보호자와 창업팀 상담을 만들고 가족 연결을 확인합니다.</span>
          </div>
          <div className={zoomConfigured ? styles.connected : styles.pending}>
            <i /> {zoomConfigured ? "Zoom 연결됨" : "Zoom 설정 대기"}
          </div>
        </header>
        <AdminConsultationPanel
          parents={(parents ?? []) as AdminParent[]}
          students={(students ?? []) as AdminParent[]}
          initialFamilyLinks={(familyLinks ?? []) as AdminFamilyLink[]}
          initialConsultations={mappedConsultations as AdminConsultation[]}
          zoomConfigured={zoomConfigured}
        />
      </section>
    </main>
  );
}
