import { redirect } from "next/navigation";
import { createClient } from "../../../../utils/supabase/server";
import { requireSignedTutorContract } from "../../../../utils/contracts/tutor-signature";
import TutorHomeworkClient, { type TutorHomeworkItem, type TutorStudent } from "./TutorHomeworkClient";
import styles from "./tutor-homework.module.css";
import { PortalText } from "../../PortalLocale";

export const dynamic = "force-dynamic";

export default async function TutorHomeworkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,tutor_registry_id,account_status")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  if (profile?.role !== "tutor" || !profile.tutor_registry_id) redirect("/portal");

  // The contract gates the account: an approved tutor still cannot use the
  // portal until the current version is signed.
  await requireSignedTutorContract(user.id);

  const [{ data: sessionRows }, { data: assignmentRows }] = await Promise.all([
    supabase
      .from("portal_sessions")
      .select("user_id,subject")
      .eq("tutor_registry_id", profile.tutor_registry_id),
    supabase
      .from("portal_assignments")
      .select("id,student_id,subject,title,instructions,due_date,attachment_name,status,submitted_at,feedback,graded_at,created_at")
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .order("created_at", { ascending: false }),
  ]);

  const studentIds = Array.from(new Set((sessionRows ?? []).map((row) => row.user_id)));
  const studentMap = new Map<string, { name: string; email: string }>();
  if (studentIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", studentIds);
    for (const student of profiles ?? []) {
      studentMap.set(student.id, {
        name: student.full_name || student.email || "학생",
        email: student.email || "",
      });
    }
  }

  const students: TutorStudent[] = studentIds.map((id) => ({
    id,
    name: studentMap.get(id)?.name || "학생",
    email: studentMap.get(id)?.email || "",
    subjects: Array.from(new Set((sessionRows ?? []).filter((row) => row.user_id === id).map((row) => row.subject))),
  }));
  const assignments: TutorHomeworkItem[] = (assignmentRows ?? []).map((row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: studentMap.get(row.student_id)?.name || "학생",
    subject: row.subject,
    title: row.title,
    instructions: row.instructions,
    dueDate: row.due_date,
    attachmentName: row.attachment_name,
    status: row.status,
    submittedAt: row.submitted_at,
    feedback: row.feedback,
    gradedAt: row.graded_at,
  }));
  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.heading}>
          <p>ASSIGNMENTS</p>
          <h1><PortalText ko="숙제 관리" en="Homework management" /></h1>
          <span><PortalText ko="배정 학생에게 과제를 등록하고 제출된 작업에 피드백을 남깁니다." en="Assign work to your students and leave feedback on their submissions." /></span>
        </header>
        <TutorHomeworkClient students={students} assignments={assignments} />
      </section>
    </main>
  );
}
