"use client";

import Link from "next/link";
import type { PortalChatThread } from "../ChatPanel";
import BookingsPanel, { type PortalBooking } from "../BookingsPanel";
import ComplaintForm from "../ComplaintForm";
import styles from "../portal.module.css";
import { useSeonbaeLocale } from "../../../utils/i18n/client";

export type TutorPortalSession = {
  id: number;
  studentName: string;
  sessionDate: string;
  startsAt: string;
  durationMinutes: number;
  actualMinutes: number | null;
  subject: string;
  title: string;
  sessionType: string;
  location: string | null;
  notes: string | null;
  zoomMeetingNumber: string | null;
  zoomStatus: string;
};

export default function TutorPortalDashboard({
  currentUserId,
  tutor,
  sessions,
  chatThreads,
  bookings,
}: {
  currentUserId: string;
  tutor: { name: string; email: string; registryId: string };
  sessions: TutorPortalSession[];
  chatThreads: PortalChatThread[];
  bookings: PortalBooking[];
}) {
  const locale = useSeonbaeLocale();
  const l = (ko: string, en: string) => locale === "ko" ? ko : en;
  const completed = sessions.filter(
    (session) => session.zoomStatus === "ended",
  );
  const completedMinutes = completed.reduce(
    (sum, session) =>
      sum + (session.actualMinutes ?? session.durationMinutes),
    0,
  );
  const activeStudents = new Set(
    sessions
      .filter((session) => session.zoomStatus !== "cancelled")
      .map((session) => session.studentName),
  ).size;
  const upcoming = sessions.filter(
    (session) =>
      session.zoomStatus !== "cancelled"
      && session.zoomStatus !== "ended"
      && new Date(`${session.sessionDate}T${session.startsAt}`).getTime()
        >= Date.now() - 30 * 60 * 1000,
  );

  return (
    <main className={styles.page}>
      <section className={styles.content}>
        <div className={styles.hero}>
          <div className={styles.heroCopy}>
            <p>{l("튜터 포털", "TUTOR PORTAL")}</p>
            <h1>
              {locale === "ko" ? `${tutor.name} 튜터님,` : `Welcome, ${tutor.name}.`}
              {locale === "ko" && <><br />오늘 수업을 준비해요.</>}
            </h1>
            <span>
              {l("수업을 개설하고 학생과 대화할 수 있는 튜터 전용 공간입니다.", "Host lessons and stay in touch with your students from one tutor workspace.")}
            </span>
            <small>{tutor.email}</small>
          </div>
          <div className={styles.stats}>
            <article>
              <b>{completed.length}</b>
              <span>{l("완료한 수업", "Completed lessons")}</span>
            </article>
            <article>
              <b>{formatMinutes(completedMinutes)}</b>
              <span>{l("누적 수업 시간", "Teaching time")}</span>
            </article>
            <article>
              <b>{activeStudents}</b>
              <span>{l("담당 학생", "Active students")}</span>
            </article>
          </div>
        </div>

        <div className={styles.sync}>
          <span className={styles.syncDot} />
          <p>
            <b>{l("튜터 호스트 권한", "Tutor host access")}</b> · {l("학생은 회의를 개설할 수 없으며, 담당 튜터만 수업 Zoom을 호스트합니다.", "Students cannot start meetings; only the assigned tutor can host a lesson on Zoom.")}
          </p>
        </div>

        <section className={`${styles.panel} ${styles.tutorSchedulePanel}`}>
          <div className={styles.panelHeading}>
            <div>
              <p>LESSON SCHEDULE</p>
              <h2>{l("예정된 수업", "Upcoming lessons")}</h2>
            </div>
            <span className={styles.chatLive}>
              {locale === "ko" ? `${upcoming.length}개의 예정 수업` : `${upcoming.length} upcoming lesson${upcoming.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className={styles.tutorSchedule}>
            {upcoming.length ? (
              upcoming.map((session) => (
                <article key={session.id}>
                  <time>
                    <b>{formatDate(session.sessionDate, locale)}</b>
                    <span>{session.startsAt.slice(0, 5)}</span>
                  </time>
                  <div>
                    <h3>{session.title}</h3>
                    <p>
                      {session.studentName} · {session.subject} ·{" "}
                      {session.durationMinutes}{l("분", " min")}
                    </p>
                  </div>
                  {session.zoomMeetingNumber ? (
                    <Link href={`/portal/meeting/${session.id}`}>
                      {l("수업 호스트 시작", "Start lesson as host")} →
                    </Link>
                  ) : (
                    <span>{l("Zoom 준비 중", "Zoom is being prepared")}</span>
                  )}
                </article>
              ))
            ) : (
              <div className={styles.chatEmpty}>{l("예정된 수업이 없습니다.", "There are no upcoming lessons.")}</div>
            )}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.tutorHistoryPanel}`}>
          <div className={styles.panelHeading}>
            <div>
              <p>COMPLETED LESSONS</p>
              <h2>{l("완료 기록", "Completed history")}</h2>
            </div>
          </div>
          <div className={styles.tutorHistory}>
            {completed.length ? (
              completed
                .slice()
                .reverse()
                .map((session) => (
                  <article key={session.id}>
                    <span>{formatDate(session.sessionDate, locale)}</span>
                    <b>{session.studentName}</b>
                    <p>{session.title}</p>
                    <strong>
                      {session.actualMinutes ?? session.durationMinutes}{l("분", " min")}
                    </strong>
                  </article>
                ))
            ) : (
              <div className={styles.chatEmpty}>
                {l("Zoom 수업이 종료되면 실제 진행 시간이 기록됩니다.", "Actual teaching time is recorded after a Zoom lesson ends.")}
              </div>
            )}
          </div>
        </section>

        <BookingsPanel bookings={bookings} />

        <ComplaintForm />
      </section>
    </main>
  );
}

function formatDate(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMinutes(value: number) {
  if (!value) return "0h";
  const hours = value / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}
