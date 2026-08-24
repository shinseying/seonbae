import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../utils/supabase/server";
import { zoomJoinUrl } from "../../../../utils/zoom/join-url";
import ZoomMeetingRoom from "../../meeting/[sessionId]/ZoomMeetingRoom";
import styles from "../../meeting/[sessionId]/meeting.module.css";

export const dynamic = "force-dynamic";

export default async function ConsultationMeetingPage({
  params,
}: {
  params: Promise<{ consultationId: string }>;
}) {
  const { consultationId: rawConsultationId } = await params;
  const consultationId = Number(rawConsultationId);
  if (!Number.isSafeInteger(consultationId) || consultationId < 1) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/portal/consultation/${consultationId}`);

  const [{ data: profile }, { data: consultation }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name,email,role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("consultation_requests")
      .select(
        "id,user_id,session_date,starts_at,duration_minutes,subject,meeting_title,notes,zoom_meeting_number,zoom_join_url,zoom_passcode,zoom_status",
      )
      .eq("id", consultationId)
      .single(),
  ]);

  if (!profile || !consultation) notFound();
  const isAdmin = profile.role === "admin";
  const isParent = profile.role === "parent" && consultation.user_id === user.id;
  if (!isAdmin && !isParent) notFound();
  const topic = consultation.subject;
  const title = consultation.meeting_title;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href={isAdmin ? "/admin/sessions" : "/portal"}>← 일정으로 돌아가기</Link>
        <span><b>선배</b><small>FAMILY CONSULTATION</small></span>
        <em>{isAdmin ? "선배팀 호스트" : "보호자"}</em>
      </header>

      <section className={styles.heading}>
        <div>
          <p>PARENT · STARTUP TEAM · PRIVATE MEETING</p>
          <h1>{title}</h1>
          <span>
            {formatDate(consultation.session_date)} · {consultation.starts_at.slice(0, 5)}
            {" · "}{consultation.duration_minutes}분
          </span>
        </div>
        <div className={styles.lessonMeta}>
          <span>상담 주제</span><b>{topic}</b>
          <span>담당</span><b>선배 창업팀</b>
          <span>상태</span><b>{statusLabel(consultation.zoom_status)}</b>
        </div>
      </section>

      <ZoomMeetingRoom
        joinUrl={zoomJoinUrl(consultation.zoom_join_url, consultation.zoom_meeting_number)}
        passcode={consultation.zoom_passcode}
        meetingReady={Boolean(consultation.zoom_meeting_number)}
        meetingStatus={consultation.zoom_status}
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
