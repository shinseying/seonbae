"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import AdminSidebar from "../AdminSidebar";
import styles from "./sessions.module.css";

export type AdminStudent = {
  id: string;
  full_name: string | null;
  email: string;
};

export type AdminZoomTutor = {
  registry_id: string;
  roster_number: string | null;
  name: string;
  exam: string;
  zoom_host_email: string | null;
  active: boolean;
};

export type AdminLesson = {
  id: number;
  user_id: string;
  tutor_registry_id: string | null;
  session_date: string;
  starts_at: string;
  duration_minutes: number;
  subject: string;
  title: string;
  notes: string | null;
  zoom_meeting_number: string | null;
  zoom_host_email: string | null;
  zoom_status: string;
};

type FormState = {
  userId: string;
  tutorRegistryId: string;
  sessionDate: string;
  startsAt: string;
  durationMinutes: number;
  subject: string;
  title: string;
  notes: string;
};

export default function AdminSessionManager({
  adminName,
  initialStudents,
  initialTutors,
  initialLessons,
  zoomConfigured,
}: {
  adminName: string;
  initialStudents: AdminStudent[];
  initialTutors: AdminZoomTutor[];
  initialLessons: AdminLesson[];
  zoomConfigured: boolean;
}) {
  const [lessons, setLessons] = useState(initialLessons);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>(() => ({
    userId: initialStudents[0]?.id || "",
    tutorRegistryId: initialTutors.find((tutor) => tutor.active)?.registry_id || "",
    sessionDate: nextDateKey(),
    startsAt: "16:00",
    durationMinutes: 60,
    subject: "",
    title: "",
    notes: "",
  }));

  const activeTutors = useMemo(
    () => initialTutors.filter((tutor) => tutor.active),
    [initialTutors],
  );

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Zoom 수업을 만들지 못했습니다.");
      setSaving(false);
      return;
    }

    setLessons((current) => [result as AdminLesson, ...current]);
    setForm((current) => ({
      ...current,
      subject: "",
      title: "",
      notes: "",
    }));
    setMessage("Zoom 수업과 포털 일정이 생성되었습니다.");
    setSaving(false);
  }

  async function cancelLesson(lesson: AdminLesson) {
    if (
      !window.confirm(
        `"${lesson.title}" 수업을 취소할까요? Zoom 회의도 함께 삭제됩니다.`,
      )
    ) {
      return;
    }

    const response = await fetch(`/api/admin/sessions?id=${lesson.id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "수업을 취소하지 못했습니다.");
      return;
    }
    setLessons((current) => current.map((item) => (
      item.id === lesson.id ? { ...item, zoom_status: "cancelled" } : item
    )));
    setMessage("수업이 취소되었습니다.");
  }

  return (
    <main className={styles.page}>
      <AdminSidebar active="sessions" adminName={adminName} styles={styles} />

      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>ZOOM · SUPABASE · LIVE SCHEDULE</p>
            <h1>수업과 Zoom 관리</h1>
            <span>학생 일정과 Zoom 교실을 한 번에 생성하고 관리합니다.</span>
          </div>
          <div className={zoomConfigured ? styles.connected : styles.pending}>
            <i /> {zoomConfigured ? "Zoom 연결됨" : "Zoom 설정 대기"}
          </div>
        </header>

        <div className={styles.workspace}>
          <form className={styles.creator} onSubmit={createLesson}>
            <div className={styles.sectionHeading}>
              <p>CREATE LESSON</p>
              <h2>새 Zoom 수업</h2>
            </div>
            <div className={styles.formGrid}>
              <label>
                <span>학생</span>
                <select value={form.userId} onChange={(event) => updateForm("userId", event.target.value)} required>
                  {initialStudents.map((student) => (
                    <option value={student.id} key={student.id}>
                      {student.full_name || student.email} · {student.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>담당 튜터</span>
                <select value={form.tutorRegistryId} onChange={(event) => updateForm("tutorRegistryId", event.target.value)} required>
                  {activeTutors.map((tutor) => (
                    <option value={tutor.registry_id} key={tutor.registry_id}>
                      {tutor.name} · {tutor.roster_number || "명부 번호 준비 중"} · {tutor.exam}
                    </option>
                  ))}
                </select>
              </label>
              <label><span>수업 날짜</span><input type="date" min={todayKey()} value={form.sessionDate} onChange={(event) => updateForm("sessionDate", event.target.value)} required /></label>
              <label><span>시작 시각</span><input type="time" value={form.startsAt} onChange={(event) => updateForm("startsAt", event.target.value)} required /></label>
              <label><span>수업 시간</span><select value={form.durationMinutes} onChange={(event) => updateForm("durationMinutes", Number(event.target.value))}><option value={45}>45분</option><option value={60}>60분</option><option value={90}>90분</option><option value={120}>120분</option></select></label>
              <label><span>과목</span><input value={form.subject} onChange={(event) => updateForm("subject", event.target.value)} placeholder="예: IB Mathematics AA HL" required /></label>
              <label className={styles.full}><span>수업 제목</span><input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="예: 미적분 모의고사 오답 정리" required /></label>
              <label className={styles.full}><span>학생 전달 사항</span><textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} rows={4} placeholder="준비물, 과제 또는 수업 전 확인 사항" /></label>
            </div>
            <button className={styles.createButton} type="submit" disabled={saving || !zoomConfigured || !initialStudents.length}>
              {saving ? "Zoom 수업 생성 중…" : "Zoom 수업 생성"} <span>↗</span>
            </button>
            <p className={message.includes("생성") ? styles.success : styles.formMessage}>{message || (!initialStudents.length ? "등록된 학생 계정이 없습니다." : "생성 즉시 학생과 튜터 포털에 반영됩니다.")}</p>
          </form>

          <section className={styles.schedule}>
            <div className={styles.sectionHeading}>
              <p>SCHEDULE</p>
              <h2>최근 수업</h2>
            </div>
            <div className={styles.lessonList}>
              {lessons.length ? lessons.map((lesson) => {
                const student = initialStudents.find((item) => item.id === lesson.user_id);
                const tutor = initialTutors.find((item) => item.registry_id === lesson.tutor_registry_id);
                return (
                  <article key={lesson.id}>
                    <time><b>{lesson.session_date}</b><span>{lesson.starts_at.slice(0, 5)} · {lesson.duration_minutes}분</span></time>
                    <div><h3>{lesson.title}</h3><p>{student?.full_name || student?.email || "학생"} · {tutor?.name || "튜터"} · {tutor?.roster_number || "명부 번호 준비 중"}</p></div>
                    <span className={styles[statusClass(lesson.zoom_status)]}>{statusLabel(lesson.zoom_status)}</span>
                    {lesson.zoom_status !== "cancelled" && lesson.zoom_status !== "ended" && (
                      <>
                        <Link href={`/portal/meeting/${lesson.id}`}>교실 열기</Link>
                        <button type="button" onClick={() => cancelLesson(lesson)}>취소</button>
                      </>
                    )}
                  </article>
                );
              }) : <div className={styles.empty}>아직 생성된 수업이 없습니다.</div>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nextDateKey() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function statusLabel(value: string) {
  if (value === "live") return "진행 중";
  if (value === "ended") return "종료";
  if (value === "cancelled") return "취소";
  if (value === "scheduled") return "예정";
  return "준비 중";
}

function statusClass(value: string) {
  if (value === "live") return "live";
  if (value === "cancelled" || value === "ended") return "inactive";
  return "scheduled";
}
