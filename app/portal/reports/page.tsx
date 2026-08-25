import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { classroomStudentIds } from "../../../utils/classrooms/students";
import ReportsContent, { type PortalReport } from "./ReportsContent";
import styles from "../parent.module.css";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,account_status")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  if (profile?.role !== "parent") redirect("/portal");

  const studentIds = await classroomStudentIds(user.id);
  const studentNames = new Map<string, string>();
  if (studentIds.length) {
    const { data: students } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", studentIds);
    for (const student of students ?? []) {
      studentNames.set(student.id, student.full_name || student.email || "학생");
    }
  }

  const { data: sessions } = studentIds.length
    ? await supabase
        .from("portal_sessions")
        .select("id,user_id,session_date,duration_minutes,actual_minutes,subject,title,notes,zoom_status,tutors(name,university)")
        .in("user_id", studentIds)
        .eq("zoom_status", "ended")
        .order("session_date", { ascending: false })
    : { data: [] };

  const reports: PortalReport[] = (sessions ?? []).map((session) => {
    const tutor = Array.isArray(session.tutors) ? session.tutors[0] : session.tutors;
    return {
      id: session.id,
      date: session.session_date,
      title: session.title,
      studentName: studentNames.get(session.user_id) || "Student",
      subject: session.subject,
      tutorName: tutor?.name || "Seonbae tutor",
      minutes: session.actual_minutes ?? session.duration_minutes,
      notes: session.notes,
    };
  });

  return (
    <main className={styles.page}>
      <ReportsContent reports={reports} studentCount={studentIds.length} />
    </main>
  );
}
