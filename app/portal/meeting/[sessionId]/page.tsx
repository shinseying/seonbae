import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../utils/supabase/server";
import { zoomJoinUrl } from "../../../../utils/zoom/join-url";
import ZoomMeetingRoom from "./ZoomMeetingRoom";
import styles from "./meeting.module.css";

export const dynamic = "force-dynamic";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId: rawSessionId } = await params;
  const sessionId = Number(rawSessionId);
  if (!Number.isSafeInteger(sessionId) || sessionId < 1) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/portal/meeting/${sessionId}`);

  const [{ data: profile }, { data: session }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name,email,role,tutor_registry_id")
      .eq("id", user.id)
      .single(),
    supabase
      .from("portal_sessions")
      .select(
        "id,session_date,starts_at,duration_minutes,subject,title,zoom_meeting_number,zoom_join_url,zoom_passcode,zoom_status,tutor_registry_id,tutors(name)",
      )
      .eq("id", sessionId)
      .single(),
  ]);

  if (!profile || !session) notFound();

  const tutor = Array.isArray(session.tutors)
    ? session.tutors[0]
    : session.tutors;
  const backHref =
    profile.role === "admin"
      ? "/admin/sessions"
      : profile.role === "tutor"
        ? "/portal/tutor"
        : "/portal";
  const roleLabel =
    profile.role === "admin"
      ? "관리자 참관"
      : profile.role === "tutor"
        ? "튜터 호스트"
        : profile.role === "parent"
          ? "보호자"
          : "수강생";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href={backHref}>← 일정으로 돌아가기</Link>
        <span>
          <b>선배</b>
          <small>ZOOM CLASSROOM</small>
        </span>
        <em>{roleLabel}</em>
      </header>

      <section className={styles.heading}>
        <div>
          <p>LIVE LESSON · SECURE PORTAL ACCESS</p>
          <h1>{session.title}</h1>
          <span>
            {formatDate(session.session_date)} · {session.starts_at.slice(0, 5)}
            {" · "}{session.duration_minutes}분
          </span>
        </div>
        <div className={styles.lessonMeta}>
          <span>과목</span><b>{session.subject}</b>
          <span>담당 튜터</span><b>{tutor?.name || "선배 튜터"}</b>
          <span>상태</span><b>{statusLabel(session.zoom_status)}</b>
        </div>
      </section>

      <ZoomMeetingRoom
        joinUrl={zoomJoinUrl(session.zoom_join_url, session.zoom_meeting_number)}
        passcode={session.zoom_passcode}
        meetingReady={Boolean(session.zoom_meeting_number)}
        meetingStatus={session.zoom_status}
      />
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function statusLabel(value: string) {
  if (value === "live") return "진행 중";
  if (value === "ended") return "종료";
  if (value === "cancelled") return "취소";
  if (value === "scheduled") return "입장 준비";
  return "Zoom 준비 중";
}
