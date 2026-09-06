import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { classroomStudentIds } from "../../../utils/classrooms/students";
import HomeworkList, { type HomeworkItem } from "./HomeworkList";
import { PortalText } from "../PortalLocale";
import styles from "./homework.module.css";
import { homeworkGroup, type HomeworkStatus } from "../../../utils/homework/workflow";

export const dynamic = "force-dynamic";

export default async function HomeworkPage() {
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
  if (profile?.role === "admin") redirect("/admin");
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  // A tutor sets homework inside the classroom now, not on a tab of its own.
  if (profile?.role === "tutor") redirect("/portal/classroom");

  const isParent = profile?.role === "parent";
  let studentIds = [user.id];
  const studentNames = new Map<string, string>();
  if (isParent) {
    studentIds = await classroomStudentIds(user.id);
  }
  if (studentIds.length) {
    const { data: students } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", studentIds);
    for (const student of students ?? []) {
      studentNames.set(student.id, student.full_name || student.email || "학생");
    }
  }

  const { data: rows } = studentIds.length
    ? await supabase
        .from("portal_assignments")
        .select("id,student_id,subject,title,instructions,due_date,attachment_name,student_attachment_name,status,submitted_at,feedback,graded_at,created_at,tutors(name)")
        .in("student_id", studentIds)
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false })
    : { data: [] };

  const assignments: HomeworkItem[] = (rows ?? []).map((row) => {
    const tutor = Array.isArray(row.tutors) ? row.tutors[0] : row.tutors;
    return {
      id: row.id,
      studentName: studentNames.get(row.student_id) || "학생",
      subject: row.subject,
      title: row.title,
      instructions: row.instructions,
      dueDate: row.due_date,
      attachmentName: row.attachment_name,
      studentAttachmentName: row.student_attachment_name,
      status: row.status as HomeworkStatus,
      submittedAt: row.submitted_at,
      feedback: row.feedback,
      gradedAt: row.graded_at,
      tutorName: tutor?.name || "담당 튜터",
    };
  });

  const openCount = assignments.filter((item) => homeworkGroup(item.status) === "assigned").length;
  const reviewCount = assignments.filter((item) => homeworkGroup(item.status) === "submitted").length;
  const returnedCount = assignments.filter((item) => homeworkGroup(item.status) === "returned").length;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.heading}>
          <div>
            <p>HOMEWORK</p>
            <h1>{isParent ? <PortalText ko="자녀 숙제 현황" en="Student homework" /> : <PortalText ko="내 숙제" en="My homework" />}</h1>
            <span>
              {isParent
                ? <PortalText ko="연결된 학생의 과제, 제출 상태와 튜터 피드백을 한곳에서 확인합니다." en="Review linked students' assignments, submission status, and tutor feedback in one place." />
                : <PortalText ko="마감일별 과제를 확인하고, 작업 파일을 제출한 뒤 튜터의 피드백까지 이어서 확인하세요." en="Review work by due date, turn in your files, and follow tutor feedback through to completion." />}
            </span>
          </div>
          <dl>
            <div><dt><PortalText ko="할 일" en="Assigned" /></dt><dd>{openCount}</dd></div>
            <div><dt><PortalText ko="제출됨" en="Turned in" /></dt><dd>{reviewCount}</dd></div>
            <div><dt><PortalText ko="반환됨" en="Returned" /></dt><dd>{returnedCount}</dd></div>
          </dl>
        </header>
        <HomeworkList assignments={assignments} role={isParent ? "parent" : "student"} />
      </section>
    </main>
  );
}
