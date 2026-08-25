"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PortalChatThread } from "./ChatPanel";
import type { PortalHeaderUser } from "./PortalHeader";
import { useSeonbaeLocale } from "../../utils/i18n/client";
import ComplaintForm from "./ComplaintForm";
import styles from "./portal.module.css";

export type PortalSession = {
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
  tutorRegistryId: string | null;
  zoomMeetingNumber: string | null;
  zoomStatus: string;
  tutor: {
    name: string;
    university: string | null;
    photoUrl: string | null;
  } | null;
};

export type PortalConsultationRequest = {
  id: number;
  subject: string | null;
  curriculum: string | null;
  goals: string | null;
  status: string;
  createdAt: string;
};

export type PortalConsultation = {
  id: number;
  sessionDate: string;
  startsAt: string;
  durationMinutes: number;
  actualMinutes: number | null;
  topic: string;
  title: string;
  notes: string | null;
  zoomMeetingNumber: string | null;
  zoomStatus: string;
};

type PortalUser = PortalHeaderUser;

export default function PortalDashboard({
  currentUserId,
  user,
  sessions,
  consultations,
  consultationRequests,
  chatThreads,
  linkedStudentCount,
}: {
  currentUserId: string;
  user: PortalUser;
  sessions: PortalSession[];
  consultations: PortalConsultation[];
  consultationRequests: PortalConsultationRequest[];
  chatThreads: PortalChatThread[];
  linkedStudentCount: number;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => initialVisibleMonth());
  const [selectedDate, setSelectedDate] = useState(() => initialDateKey());
  const locale = useSeonbaeLocale();
  const l = (ko: string, en: string) => locale === "ko" ? ko : en;

  const calendarDays = useMemo(
    () => getCalendarDays(visibleMonth),
    [visibleMonth],
  );
  const selectedSessions = sessions.filter(
    (session) => session.sessionDate === selectedDate,
  );
  const selected = selectedSessions[0] ?? null;
  const nextSession =
    sessions.find(
      (session) =>
        session.zoomStatus !== "cancelled"
        && session.zoomStatus !== "ended"
        && sessionDateTime(session).getTime() >= Date.now(),
    ) ?? null;
  const completed = sessions.filter(
    (session) => session.zoomStatus === "ended",
  );
  const completedMinutes = completed.reduce(
    (sum, session) =>
      sum + (session.actualMinutes ?? session.durationMinutes),
    0,
  );
  const completedConsultations = consultations.filter(
    (session) => session.zoomStatus === "ended",
  ).length;

  function moveMonth(direction: number) {
    const nextMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + direction,
      1,
    );
    if (nextMonth < MINIMUM_PORTAL_MONTH) return;
    setVisibleMonth(nextMonth);
    setSelectedDate(localDateKey(nextMonth));
  }

  function selectCalendarDate(date: Date) {
    if (date < MINIMUM_PORTAL_MONTH) return;
    setSelectedDate(localDateKey(date));
    if (!sameMonth(date, visibleMonth)) setVisibleMonth(startOfMonth(date));
  }

  return (
    <main className={styles.page}>
      <section className={styles.content}>
        <div className={styles.hero}>
          <div className={styles.heroCopy}>
            <p>
              {user.role === "parent" ? l("보호자 포털", "FAMILY PORTAL") : l("학생 포털", "STUDENT PORTAL")}
            </p>
            <h1>
              {locale === "ko" ? `${user.name}님,` : `Welcome, ${user.name}.`}
              {locale === "ko" && <><br />오늘도 함께 시작해요.</>}
            </h1>
            <span>
              {user.role === "parent"
                ? l("자녀의 수업 현황과 창업팀 상담 일정을 한곳에서 확인하세요.", "See your students' lesson progress and team consultation schedule in one place.")
                : l("수업 일정, 누적 학습 기록, 담당 튜터와의 대화를 확인하세요.", "See lesson schedules, learning history, and conversations with your tutor.")}
            </span>
            <small>{user.email}</small>
          </div>
          <div className={styles.stats}>
            <article>
              <b>{completed.length}</b>
              <span>{l("완료한 수업", "Completed lessons")}</span>
            </article>
            <article>
              <b>{formatMinutes(completedMinutes)}</b>
              <span>{l("누적 수업 시간", "Learning time")}</span>
            </article>
            <article>
              <b>
                {user.role === "parent"
                  ? linkedStudentCount
                  : new Set(
                      sessions
                        .map((session) => session.tutorRegistryId)
                        .filter(Boolean),
                    ).size}
              </b>
              <span>
                {user.role === "parent" ? l("연결된 학생", "Linked students") : l("담당 튜터", "Tutors")}
              </span>
            </article>
          </div>
        </div>

        <div className={styles.sync}>
          <span className={styles.syncDot} />
          <p>
            <b>{l("실시간 일정", "Live schedule")}</b> · {l("Zoom 회의가 끝나면 실제 진행 시간과 완료 수업 수가 자동으로 반영됩니다.", "Actual meeting time and completed lesson counts update automatically after each Zoom session.")}
          </p>
          <time>
            {new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
              month: "long",
              day: "numeric",
            }).format(new Date())}{" "}
            {l("기준", "updated")}
          </time>
        </div>

        {user.role === "parent" && (
          <section className={styles.parentActions} aria-label={l("보호자 주요 메뉴", "Parent shortcuts")}>
            <div>
              <strong>
                {linkedStudentCount > 0
                  ? l(`${linkedStudentCount}명의 학생 계정이 연결되어 있습니다.`, `${linkedStudentCount} student account${linkedStudentCount === 1 ? " is" : "s are"} linked.`)
                  : l("교실 ID와 비밀번호로 교실에 참여해 주세요.", "Join a classroom with its ID and password.")}
              </strong>
              <span>
                {l("교실에 참여하면 학생 일정, 수업 리포트, 결제 내역을 함께 관리할 수 있습니다.", "Join a classroom to follow lesson schedules, reports, and billing together.")}
              </span>
            </div>
            <nav>
              <Link href="/portal/classroom">{l("내 교실", "My classroom")}</Link>
              {/* The roster is on the public site, so this leaves the portal. */}
              <Link href="/tutors">{l("튜터 찾기", "Find a tutor")}</Link>
              <Link href="/portal/reports">{l("수업 리포트", "Reports")}</Link>
              <Link href="/portal/billing">{l("결제 내역", "Billing")}</Link>
            </nav>
          </section>
        )}

        <div className={styles.dashboard}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <p>YOUR CALENDAR</p>
                <h2>{l("월간 수업 일정", "Monthly lesson calendar")}</h2>
              </div>
              <div className={styles.monthNav}>
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  aria-label={l("이전 달", "Previous month")}
                  disabled={sameMonth(visibleMonth, MINIMUM_PORTAL_MONTH)}
                >
                  ←
                </button>
                <span>{locale === "ko" ? formatMonth(visibleMonth) : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(visibleMonth)}</span>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  aria-label={l("다음 달", "Next month")}
                >
                  →
                </button>
              </div>
            </div>

            <div className={styles.calendarWeekdays} aria-hidden="true">
              {(locale === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className={styles.calendarGrid}>
              {calendarDays.map((date) => {
                const key = localDateKey(date);
                const count = sessions.filter(
                  (session) => session.sessionDate === key,
                ).length;
                const beforeMinimum = date < MINIMUM_PORTAL_MONTH;
                const className = [
                  !sameMonth(date, visibleMonth) ? styles.outsideMonth : "",
                  selectedDate === key ? styles.selectedDay : "",
                  key === localDateKey(new Date()) ? styles.today : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    type="button"
                    className={className}
                    onClick={() => selectCalendarDate(date)}
                    key={key}
                    disabled={beforeMinimum}
                    aria-pressed={selectedDate === key}
                    aria-label={`${formatDate(key, locale)}, ${l(`수업 ${count}개`, `${count} lesson${count === 1 ? "" : "s"}`)}`}
                  >
                    <span className={styles.calendarNumber}>
                      {date.getDate()}
                    </span>
                    {count > 0 && <em>{locale === "ko" ? `${count}개` : count}</em>}
                  </button>
                );
              })}
            </div>

            <div className={styles.lessons}>
              {selectedSessions.length ? (
                selectedSessions.map((session) => (
                  <article className={styles.lesson} key={session.id}>
                    <span className={styles.lessonBar} />
                    <time>
                      <b>{session.startsAt.slice(0, 5)}</b>
                      <small>{session.durationMinutes}{l("분", " min")}</small>
                    </time>
                    <div>
                      <h3>{session.title}</h3>
                      <p>
                        {user.role === "parent"
                          ? `${session.studentName} · `
                          : ""}
                        {session.tutor?.name || l("담당 튜터 배정 중", "Tutor assignment pending")} ·{" "}
                        {session.sessionType}
                      </p>
                    </div>
                    <span className={styles.subject}>{session.subject}</span>
                    {zoomIsAvailable(session) && (
                      <Link
                        className={styles.zoomLink}
                        href={`/portal/meeting/${session.id}`}
                      >
                        {l("Zoom 입장", "Join Zoom")} →
                      </Link>
                    )}
                  </article>
                ))
              ) : (
                <div className={styles.empty}>
                  <span>{l("수업이 없는 날입니다.", "There are no lessons on this day.")}</span>
                  <p>{l("다른 날짜를 선택하면 예정된 수업을 확인할 수 있습니다.", "Choose another date to see scheduled lessons.")}</p>
                </div>
              )}
            </div>
          </section>

          <aside className={styles.side}>
            <section className={styles.panel}>
              <div className={styles.sideHeading}>
                <p>UP NEXT</p>
                <h2>{l("다음 수업", "Next lesson")}</h2>
              </div>
              {nextSession ? (
                <div className={styles.next}>
                  <span>
                    {formatDate(nextSession.sessionDate, locale)} ·{" "}
                    {nextSession.startsAt.slice(0, 5)}
                  </span>
                  <h3>{nextSession.title}</h3>
                  <p>
                    {nextSession.subject} · {nextSession.durationMinutes}{l("분", " min")}
                  </p>
                  <b>
                    {user.role === "parent"
                      ? `${nextSession.studentName} · `
                      : ""}
                    {nextSession.sessionType}
                  </b>
                  {zoomIsAvailable(nextSession) && (
                    <Link
                      className={styles.nextZoomLink}
                      href={`/portal/meeting/${nextSession.id}`}
                    >
                      {l("Zoom 교실 입장", "Join Zoom classroom")} <span>→</span>
                    </Link>
                  )}
                </div>
              ) : (
                <div className={styles.sideEmpty}>
                  {l("예정된 다음 수업이 없습니다.", "There is no upcoming lesson.")}
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.sideHeading}>
                <p>LESSON DETAILS</p>
                <h2>{l("선택한 수업", "Selected lesson")}</h2>
              </div>
              {selected ? (
                <div className={styles.tutorDetail}>
                  {selected.tutor?.photoUrl ? (
                    <img
                      src={selected.tutor.photoUrl}
                      alt={locale === "ko" ? `${selected.tutor.name} 튜터` : `${selected.tutor.name}, tutor`}
                    />
                  ) : (
                    <span className={styles.tutorPhoto}>
                      {initials(selected.tutor?.name || "Seonbae")}
                    </span>
                  )}
                  <div>
                    <b>{selected.tutor?.name || l("담당 튜터 배정 중", "Tutor assignment pending")}</b>
                    <small>
                      {selected.tutor?.university
                        || selected.tutorRegistryId
                        || l("선배 튜터", "Seonbae tutor")}
                    </small>
                  </div>
                  <p>
                    {selected.notes
                      || l("수업 전 전달 사항이 등록되면 이곳에 표시됩니다.", "Lesson notes will appear here when they are added.")}
                  </p>
                </div>
              ) : (
                <div className={styles.sideEmpty}>
                  {l("수업을 선택하면 담당 튜터와 전달 사항을 확인할 수 있습니다.", "Choose a lesson to see its tutor and notes.")}
                </div>
              )}
            </section>
          </aside>
        </div>

        {user.role === "parent" && (
          <ParentConsultations
            consultations={consultations}
            consultationRequests={consultationRequests}
            completedCount={completedConsultations}
            locale={locale}
          />
        )}

        <ComplaintForm />
      </section>
    </main>
  );
}

function ParentConsultations({
  consultations,
  consultationRequests,
  completedCount,
  locale,
}: {
  consultations: PortalConsultation[];
  consultationRequests: PortalConsultationRequest[];
  completedCount: number;
  locale: "ko" | "en";
}) {
  const l = (ko: string, en: string) => locale === "ko" ? ko : en;
  return (
    <section className={`${styles.panel} ${styles.chatPanel}`}>
      <div className={styles.panelHeading}>
        <div>
          <p>FAMILY CONSULTATION</p>
          <h2>{l("창업팀 상담", "Team consultation")}</h2>
        </div>
        <span className={styles.chatLive}>
          {l(`완료 ${completedCount}회 · 수업 상담과 별도 운영`, `${completedCount} completed · separate from lessons`)}
        </span>
      </div>
      <p className={styles.consultationIntro}>
        {l("학습 방향, 튜터 매칭, 서비스 이용에 관한 보호자 상담입니다. 튜터 · 학생 수업과 분리된 전용 Zoom 회의로 진행됩니다.", "A separate parent consultation about learning direction, tutor matching, and the service, held in its own Zoom meeting.")}
      </p>
      <div className={styles.consultations}>
        {consultations.length ? (
          consultations.map((consultation) => (
            <article className={styles.consultationCard} key={consultation.id}>
              <time>
                <b>{formatDate(consultation.sessionDate, locale)}</b>
                <span>{consultation.startsAt.slice(0, 5)}</span>
              </time>
              <div>
                <h3>{consultation.title}</h3>
                <p>
                  {consultation.topic} · {consultation.durationMinutes}{l("분", " min")}
                  {consultation.zoomStatus === "ended"
                    ? l(` · 실제 ${consultation.actualMinutes ?? consultation.durationMinutes}분`, ` · ${consultation.actualMinutes ?? consultation.durationMinutes} actual min`)
                    : ""}
                </p>
              </div>
              {consultationZoomIsAvailable(consultation) && (
                <Link href={`/portal/consultation/${consultation.id}`}>
                  {l("상담 입장", "Join consultation")} →
                </Link>
              )}
            </article>
          ))
        ) : (
          <div className={styles.chatEmpty}>
            {l("예정된 창업팀 상담이 없습니다. 상담 신청 후 일정이 확정되면 이곳에 표시됩니다.", "There is no scheduled team consultation. Confirmed bookings will appear here.")}
          </div>
        )}
      </div>

      {consultationRequests.length > 0 && (
        <div className={styles.requestList}>
          <p className={styles.requestHeading}>
            {l("접수된 상담 신청", "Consultation requests you filed")}
          </p>
          {consultationRequests.map((request) => (
            <article className={styles.requestCard} key={request.id}>
              <header>
                <b>{request.subject || l("상담 신청", "Consultation request")}</b>
                <span data-status={request.status}>{requestStatusLabel(request.status, locale)}</span>
              </header>
              {request.curriculum && <p className={styles.requestMeta}>{request.curriculum}</p>}
              {request.goals && <p className={styles.requestGoals}>{request.goals}</p>}
              <time>{formatDate(request.createdAt.slice(0, 10), locale)}</time>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const MINIMUM_PORTAL_MONTH = new Date(2026, 0, 1);

function initialVisibleMonth() {
  const now = new Date();
  return now < MINIMUM_PORTAL_MONTH
    ? MINIMUM_PORTAL_MONTH
    : startOfMonth(now);
}

function initialDateKey() {
  const now = new Date();
  return localDateKey(now < MINIMUM_PORTAL_MONTH ? MINIMUM_PORTAL_MONTH : now);
}

function getCalendarDays(month: Date) {
  const firstVisibleDate = new Date(month.getFullYear(), month.getMonth(), 1);
  firstVisibleDate.setDate(
    firstVisibleDate.getDate() - firstVisibleDate.getDay(),
  );
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisibleDate);
    date.setDate(firstVisibleDate.getDate() + index);
    return date;
  });
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameMonth(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
  );
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sessionDateTime(session: PortalSession) {
  return new Date(`${session.sessionDate}T${session.startsAt}`);
}

function formatDate(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(value);
}

function formatMinutes(value: number) {
  if (!value) return "0h";
  const hours = value / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function initials(value: string) {
  const clean = value.trim();
  if (!clean) return "선";
  if (/^[가-힣]/.test(clean)) return clean.slice(-2);
  return clean
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function zoomIsAvailable(session: PortalSession) {
  return (
    Boolean(session.zoomMeetingNumber)
    && session.zoomStatus !== "cancelled"
    && session.zoomStatus !== "ended"
  );
}

function consultationZoomIsAvailable(session: PortalConsultation) {
  return (
    Boolean(session.zoomMeetingNumber)
    && session.zoomStatus !== "cancelled"
    && session.zoomStatus !== "ended"
  );
}

function requestStatusLabel(status: string, locale: "ko" | "en") {
  const ko: Record<string, string> = {
    new: "접수됨",
    contacted: "연락 완료",
    closed: "처리 완료",
  };
  const en: Record<string, string> = {
    new: "Received",
    contacted: "Contacted",
    closed: "Closed",
  };
  return (locale === "ko" ? ko : en)[status] || status;
}
