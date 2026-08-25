"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Spinner from "../../Spinner";
import styles from "../classroom.module.css";

// The tutor's controls for one classroom: open a Zoom lesson, set homework, and
// leave feedback. These call the existing tutor endpoints, scoped to the
// student who holds this room's seat.
export default function ClassroomTools({
  studentId,
  assignments,
}: {
  studentId: string | null;
  assignments: Array<{ id: number; title: string; feedback: string | null }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"lesson" | "homework" | "feedback" | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");

  if (!studentId) {
    return (
      <section className={styles.block}>
        <h3>튜터 도구</h3>
        <p className={styles.blockEmpty}>
          학생이 배정되면 이 교실에서 수업을 열고 숙제를 낼 수 있습니다.
        </p>
      </section>
    );
  }

  function report(ok: boolean, text: string) {
    setTone(ok ? "ok" : "error");
    setMessage(text);
    if (ok) router.refresh();
  }

  async function startLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("lesson");
    setMessage("");
    try {
      const response = await fetch("/api/tutor/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: studentId,
          sessionDate: form.get("sessionDate"),
          startsAt: form.get("startsAt"),
          durationMinutes: Number(form.get("durationMinutes")),
          subject: form.get("subject"),
          title: form.get("title"),
        }),
      });
      const result = await response.json().catch(() => null);
      report(response.ok, response.ok ? "Zoom 수업을 열었습니다." : result?.error || "수업을 열지 못했습니다.");
    } catch {
      report(false, "네트워크를 확인해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function assignHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The homework endpoint takes multipart so an attachment can ride along.
    const form = new FormData(event.currentTarget);
    form.set("studentId", studentId!);
    setBusy("homework");
    setMessage("");
    try {
      const response = await fetch("/api/homework", { method: "POST", body: form });
      const result = await response.json().catch(() => null);
      report(response.ok, response.ok ? "숙제를 등록했습니다." : result?.error || "숙제를 등록하지 못했습니다.");
      if (response.ok) event.currentTarget.reset();
    } catch {
      report(false, "네트워크를 확인해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function leaveFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("feedback");
    setMessage("");
    try {
      const response = await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: Number(form.get("assignmentId")),
          feedback: form.get("feedback"),
        }),
      });
      const result = await response.json().catch(() => null);
      report(response.ok, response.ok ? "피드백을 남겼습니다." : result?.error || "피드백을 남기지 못했습니다.");
    } catch {
      report(false, "네트워크를 확인해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.block}>
      <h3>튜터 도구</h3>
      {message && <p className={styles.toolMessage} data-tone={tone} role="status">{message}</p>}

      <form className={styles.toolForm} onSubmit={startLesson}>
        <b>Zoom 수업 열기</b>
        <label><span>날짜</span><input type="date" name="sessionDate" required /></label>
        <label><span>시작 시각</span><input type="time" name="startsAt" step={900} required /></label>
        <label>
          <span>수업 시간</span>
          <select name="durationMinutes" defaultValue="60">
            {[30, 45, 60, 90, 120].map((n) => <option value={n} key={n}>{n}분</option>)}
          </select>
        </label>
        <label><span>과목</span><input name="subject" required maxLength={100} /></label>
        <label><span>수업 제목</span><input name="title" required maxLength={160} /></label>
        <button type="submit" disabled={busy !== null}>
          {busy === "lesson" ? <Spinner label="여는 중" /> : "수업 열기"}
        </button>
      </form>

      <form className={styles.toolForm} onSubmit={assignHomework}>
        <b>숙제 내기</b>
        <label><span>과목</span><input name="subject" required maxLength={100} /></label>
        <label><span>제목</span><input name="title" required maxLength={160} /></label>
        <label><span>마감일</span><input type="date" name="dueDate" /></label>
        <label className={styles.toolWide}><span>안내</span><textarea name="instructions" rows={3} maxLength={2000} /></label>
        <label className={styles.toolWide}><span>첨부 파일</span><input type="file" name="attachment" /></label>
        <button type="submit" disabled={busy !== null}>
          {busy === "homework" ? <Spinner label="등록 중" /> : "숙제 등록"}
        </button>
      </form>

      {assignments.length > 0 && (
        <form className={styles.toolForm} onSubmit={leaveFeedback}>
          <b>피드백 남기기</b>
          <label className={styles.toolWide}>
            <span>숙제</span>
            <select name="assignmentId" defaultValue={assignments[0]?.id}>
              {assignments.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title}{item.feedback ? " (피드백 있음)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.toolWide}><span>피드백</span><textarea name="feedback" rows={3} maxLength={3000} required /></label>
          <button type="submit" disabled={busy !== null}>
            {busy === "feedback" ? <Spinner label="저장 중" /> : "피드백 저장"}
          </button>
        </form>
      )}
    </section>
  );
}
