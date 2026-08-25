import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { zoomJoinUrl } from "../../../../utils/zoom/join-url";
import ClassroomCalendar from "./ClassroomCalendar";
import ClassroomTools from "./ClassroomTools";
import styles from "../classroom.module.css";

export const dynamic = "force-dynamic";

// One classroom, opened from the list. Everything the room holds lives here:
// the lessons and their Zoom links, the homework and its feedback, and the
// recordings once a lesson has ended.
export default async function ClassroomDetailPage({
  params,
}: {
  params: Promise<{ classroomId: string }>;
}) {
  const { classroomId: raw } = await params;
  const classroomId = Number(raw);
  if (!Number.isSafeInteger(classroomId) || classroomId < 1) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/portal/classroom/${classroomId}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status,tutor_registry_id")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "approved") redirect("/portal/pending");

  const admin = createAdminClient();
  const { data: room } = await admin
    .from("classrooms")
    .select("id,title,join_code,join_password,student_id,tutor_registry_id")
    .eq("id", classroomId)
    .maybeSingle();
  if (!room) notFound();

  // Membership decides access; the room is not readable by id alone.
  const isTutor = profile.role === "tutor" && profile.tutor_registry_id === room.tutor_registry_id;
  const isStudent = room.student_id === user.id;
  let isMember = false;
  if (!isTutor && !isStudent) {
    const { data: membership } = await admin
      .from("classroom_members")
      .select("id")
      .eq("classroom_id", room.id)
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();
    isMember = Boolean(membership);
  }
  if (!isTutor && !isStudent && !isMember) notFound();

  const [{ data: tutor }, { data: student }, { data: memberRows }] = await Promise.all([
    admin.from("tutors").select("name").eq("registry_id", room.tutor_registry_id).maybeSingle(),
    room.student_id
      ? admin.from("profiles").select("full_name,email").eq("id", room.student_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("classroom_members")
      .select("user_id,role")
      .eq("classroom_id", room.id)
      .eq("status", "approved"),
  ]);

  // Who else is in the room, so opening it shows the parents too.
  const memberIds = (memberRows ?? []).map((row) => row.user_id);
  const { data: memberProfiles } = memberIds.length
    ? await admin.from("profiles").select("id,full_name,email").in("id", memberIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string }> };
  const members = (memberRows ?? []).map((row) => {
    const person = (memberProfiles ?? []).find((item) => item.id === row.user_id);
    return {
      id: row.user_id,
      name: person?.full_name || person?.email || "회원",
      role: row.role,
    };
  });

  const [{ data: lessons }, { data: homework }] = await Promise.all([
    room.student_id
      ? admin
          .from("portal_sessions")
          .select("id,session_date,starts_at,duration_minutes,subject,title,notes,zoom_status,zoom_meeting_number,zoom_join_url,recording_url,cancellation_reason")
          .eq("user_id", room.student_id)
          .eq("tutor_registry_id", room.tutor_registry_id)
          .order("session_date", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    room.student_id
      ? admin
          .from("portal_assignments")
          .select("id,title,due_date,status,feedback,instructions")
          .eq("student_id", room.student_id)
          .eq("tutor_registry_id", room.tutor_registry_id)
          .order("due_date", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const title = room.title || `${student?.full_name || "빈 자리"} · ${tutor?.name || room.tutor_registry_id}`;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.heading}>
          <Link className={styles.backLink} href="/portal/classroom">← 내 교실</Link>
          <p>CLASSROOM</p>
          <h1>{title}</h1>
          <span>
            학생 {student?.full_name || "배정 전"} · 튜터 {tutor?.name || room.tutor_registry_id}
          </span>
        </header>

        {(isTutor || isStudent) && (
          <div className={styles.codeBox}>
            <div><small>교실 ID</small><b>{room.join_code}</b></div>
            <div><small>비밀번호</small><b>{room.join_password}</b></div>
            <p>보호자에게 전달하면 이 교실에 참여를 요청할 수 있습니다.</p>
          </div>
        )}

        {isTutor && (
          <ClassroomTools
            studentId={room.student_id}
            assignments={(homework ?? []).map((item) => ({
              id: item.id,
              title: item.title,
              feedback: item.feedback,
            }))}
          />
        )}

        <ClassroomCalendar
          lessons={(lessons ?? []).map((lesson) => ({
            id: lesson.id,
            date: lesson.session_date,
            startsAt: lesson.starts_at,
            title: lesson.title,
            subject: lesson.subject,
            status: lesson.zoom_status,
            cancellationReason: lesson.cancellation_reason,
          }))}
        />

        <section className={styles.block}>
          <h3>Zoom 수업</h3>
          {(lessons ?? []).length ? (lessons ?? []).map((lesson) => {
            const joinUrl = zoomJoinUrl(lesson.zoom_join_url, lesson.zoom_meeting_number);
            const joinable = joinUrl && lesson.zoom_status !== "cancelled" && lesson.zoom_status !== "ended";
            return (
              <article key={lesson.id} className={styles.item}>
                <div>
                  <b>{lesson.title}</b>
                  <small>
                    {lesson.session_date} {lesson.starts_at?.slice(0, 5)} · {lesson.subject}
                    {lesson.duration_minutes ? ` · ${lesson.duration_minutes}분` : ""}
                  </small>
                </div>
                {joinable
                  ? <a href={joinUrl ?? undefined} target="_blank" rel="noreferrer">Zoom 입장 ↗</a>
                  : lesson.recording_url
                    ? <a href={lesson.recording_url} target="_blank" rel="noreferrer">녹화본 보기 ↗</a>
                    : <span data-status={lesson.zoom_status}>{lesson.zoom_status === "ended" ? "녹화 준비 중" : "예정"}</span>}
                {lesson.notes && <p className={styles.feedback}>{lesson.notes}</p>}
              </article>
            );
          }) : <p className={styles.blockEmpty}>등록된 수업이 없습니다.</p>}
        </section>

        <section className={styles.block}>
          <h3>숙제와 피드백</h3>
          {(homework ?? []).length ? (homework ?? []).map((item) => (
            <article key={item.id} className={styles.item}>
              <div>
                <b>{item.title}</b>
                <small>{item.due_date ? `마감 ${item.due_date}` : "마감 없음"}</small>
              </div>
              <span data-status={item.status}>
                {item.status === "graded" ? "피드백 완료" : item.status === "submitted" ? "제출 완료" : "진행 중"}
              </span>
              {item.instructions && <p className={styles.feedback}>{item.instructions}</p>}
              {item.feedback && <p className={styles.feedback}>{item.feedback}</p>}
            </article>
          )) : <p className={styles.blockEmpty}>등록된 숙제가 없습니다.</p>}
        </section>

        <section className={styles.block}>
          <h3>참여 중인 보호자</h3>
          {members.filter((member) => member.role === "parent").length ? (
            <p className={styles.blockEmpty}>
              {members.filter((member) => member.role === "parent").map((member) => member.name).join(", ")}
            </p>
          ) : (
            <p className={styles.blockEmpty}>아직 참여 중인 보호자가 없습니다.</p>
          )}
        </section>
      </section>
    </main>
  );
}
