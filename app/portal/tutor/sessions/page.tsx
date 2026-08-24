import { redirect } from "next/navigation";
import { createClient } from "../../../../utils/supabase/server";
import { requireSignedTutorContract } from "../../../../utils/contracts/tutor-signature";
import { PortalText } from "../../PortalLocale";
import TutorSessionForm, { type TutorStudent, type ScheduledSession } from "./TutorSessionForm";
import styles from "./sessions.module.css";

export const dynamic = "force-dynamic";

export default async function TutorSessionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status,tutor_registry_id")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  if (profile?.role !== "tutor" || !profile.tutor_registry_id) redirect("/portal");

  // The contract gates the account: an approved tutor still cannot use the
  // portal until the current version is signed.
  await requireSignedTutorContract(user.id);

  // The roster is whoever the tutor already has a thread or a session with, so
  // the dropdown can never offer a student the API would reject.
  const [{ data: threadRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from("chat_threads")
      .select("student_id")
      .eq("tutor_registry_id", profile.tutor_registry_id),
    supabase
      .from("portal_sessions")
      .select("id,user_id,session_date,starts_at,duration_minutes,subject,title,zoom_meeting_number,zoom_status")
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .order("session_date", { ascending: false })
      .order("starts_at", { ascending: false })
      .limit(20),
  ]);

  const studentIds = Array.from(
    new Set([
      ...(threadRows ?? []).map((row) => row.student_id),
      ...(sessionRows ?? []).map((row) => row.user_id),
    ]),
  );

  const students: TutorStudent[] = [];
  if (studentIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", studentIds);
    for (const row of data ?? []) {
      students.push({ id: row.id, name: row.full_name || row.email || "학생" });
    }
  }
  const nameFor = new Map(students.map((student) => [student.id, student.name]));

  const sessions: ScheduledSession[] = (sessionRows ?? []).map((row) => ({
    id: row.id,
    studentName: nameFor.get(row.user_id) || "학생",
    sessionDate: row.session_date,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    subject: row.subject,
    title: row.title,
    meetingNumber: row.zoom_meeting_number,
    status: row.zoom_status,
  }));

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.heading}>
          <p>ZOOM</p>
          <h1><PortalText ko="Zoom 수업 개설" en="Create a Zoom lesson" /></h1>
          <span>
            <PortalText
              ko="담당 학생과의 수업을 만들면 학생 포털에 바로 표시되고, 같은 버튼으로 입장합니다."
              en="A lesson you create appears in the student's portal right away, joined through the same button every week."
            />
          </span>
        </header>
        <TutorSessionForm students={students} sessions={sessions} />
      </section>
    </main>
  );
}
