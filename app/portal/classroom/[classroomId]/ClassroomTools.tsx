"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Spinner from "../../Spinner";
import { usePortalText } from "../../PortalLocale";
import styles from "../classroom.module.css";

// The tutor's controls for one classroom: open a Zoom lesson, set homework, and
// leave feedback. These call the existing tutor endpoints, scoped to the
// student who holds this room's seat.
export default function ClassroomTools({
  studentId,
  assignments,
}: {
  studentId: string | null;
  assignments: Array<{
    id: number;
    title: string;
    instructions: string;
    dueDate: string;
    status: string;
    feedback: string | null;
    studentAttachmentName: string | null;
    submittedAt: string | null;
  }>;
}) {
  const router = useRouter();
  const { locale, text: l } = usePortalText();
  const [busy, setBusy] = useState<"lesson" | "homework" | "feedback" | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");
  const [reviewQueue, setReviewQueue] = useState<"ready" | "assigned" | "returned">("ready");
  const [reviewId, setReviewId] = useState<number | null>(assignments.find((item) => item.status === "submitted")?.id ?? assignments[0]?.id ?? null);

  const reviewRows = useMemo(() => assignments.filter((item) => {
    if (reviewQueue === "ready") return item.status === "submitted";
    if (reviewQueue === "returned") return item.status === "graded" || item.status === "needs_revision";
    return item.status === "todo";
  }), [assignments, reviewQueue]);
  const selectedReview = reviewRows.find((item) => item.id === reviewId) ?? reviewRows[0] ?? null;

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
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const returnMode = submitter?.value === "revision" ? "revision" : "returned";
    setBusy("feedback");
    setMessage("");
    try {
      const response = await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade",
          assignmentId: Number(form.get("assignmentId")),
          feedback: form.get("feedback"),
          returnMode,
        }),
      });
      const result = await response.json().catch(() => null);
      report(
        response.ok,
        response.ok
          ? returnMode === "revision"
            ? l("수정을 요청했습니다.", "Returned for revision.")
            : l("피드백과 함께 과제를 반환했습니다.", "Returned with feedback.")
          : result?.error || l("피드백을 남기지 못했습니다.", "Could not save feedback."),
      );
    } catch {
      report(false, l("네트워크를 확인해 주세요.", "Check your connection."));
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
        <label><span>마감일</span><input type="date" name="dueDate" required /></label>
        <label className={styles.toolWide}><span>안내</span><textarea name="instructions" rows={3} maxLength={2000} required /></label>
        <label className={styles.toolWide}><span>첨부 파일</span><input type="file" name="attachment" /></label>
        <button type="submit" disabled={busy !== null}>
          {busy === "homework" ? <Spinner label="등록 중" /> : "숙제 등록"}
        </button>
      </form>

      {assignments.length > 0 && (
        <section className={styles.reviewBoard}>
          <header className={styles.reviewHead}>
            <div>
              <b>{l("과제 검토", "Review assignments")}</b>
              <p>{l("제출된 작업을 열고 피드백과 함께 반환하거나 수정을 요청하세요.", "Open submitted work, then return it with feedback or request a revision.")}</p>
            </div>
            <nav className={styles.reviewTabs} aria-label={l("검토 목록", "Review queues")}>
              {(["ready", "assigned", "returned"] as const).map((queue) => (
                <button
                  type="button"
                  key={queue}
                  data-active={reviewQueue === queue}
                  onClick={() => {
                    setReviewQueue(queue);
                    const next = assignments.find((item) => queue === "ready"
                      ? item.status === "submitted"
                      : queue === "returned"
                        ? item.status === "graded" || item.status === "needs_revision"
                        : item.status === "todo");
                    setReviewId(next?.id ?? null);
                  }}
                >
                  {reviewQueueLabel(queue, locale)}
                  <span>{assignments.filter((item) => queue === "ready"
                    ? item.status === "submitted"
                    : queue === "returned"
                      ? item.status === "graded" || item.status === "needs_revision"
                      : item.status === "todo").length}</span>
                </button>
              ))}
            </nav>
          </header>

          {reviewRows.length ? (
            <div className={styles.reviewWorkspace}>
              <div className={styles.reviewList}>
                {reviewRows.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    data-active={selectedReview?.id === item.id}
                    onClick={() => setReviewId(item.id)}
                  >
                    <span><b>{item.title}</b><small>{l("마감", "Due")} {formatReviewDate(item.dueDate, locale)}</small></span>
                    <i data-status={item.status}>{reviewStatus(item.status, locale)}</i>
                  </button>
                ))}
              </div>

              {selectedReview && (
                <form className={styles.reviewDetail} onSubmit={leaveFeedback}>
                  <input type="hidden" name="assignmentId" value={selectedReview.id} />
                  <div className={styles.reviewTitle}>
                    <div><span>{l("과제", "Assignment")}</span><h4>{selectedReview.title}</h4></div>
                    <i data-status={selectedReview.status}>{reviewStatus(selectedReview.status, locale)}</i>
                  </div>
                  <p className={styles.reviewInstructions}>{selectedReview.instructions}</p>
                  <dl className={styles.reviewMeta}>
                    <div><dt>{l("마감", "Due")}</dt><dd>{formatReviewDate(selectedReview.dueDate, locale)}</dd></div>
                    <div><dt>{l("제출", "Turned in")}</dt><dd>{selectedReview.submittedAt ? formatReviewDateTime(selectedReview.submittedAt, locale) : "—"}</dd></div>
                  </dl>
                  <div className={styles.studentWork}>
                    <span>{l("학생 작업", "Student work")}</span>
                    {selectedReview.studentAttachmentName
                      ? <a href={`/api/homework?submission=${selectedReview.id}`} target="_blank" rel="noreferrer">{selectedReview.studentAttachmentName} ↗</a>
                      : <small>{l("첨부된 파일 없이 제출되었습니다.", "Turned in without an attached file.")}</small>}
                  </div>
                  {selectedReview.status === "submitted" ? (
                    <>
                      <label className={styles.reviewFeedback}>
                        <span>{l("학생에게 보낼 피드백", "Feedback for the student")}</span>
                        <textarea name="feedback" rows={5} maxLength={3000} required defaultValue={selectedReview.feedback || ""} />
                      </label>
                      <div className={styles.returnActions}>
                        <button type="submit" name="returnMode" value="revision" disabled={busy !== null} className={styles.revisionButton}>
                          {busy === "feedback" ? <Spinner label={l("처리 중", "Working")} /> : l("수정 요청", "Return for revision")}
                        </button>
                        <button type="submit" name="returnMode" value="returned" disabled={busy !== null}>
                          {busy === "feedback" ? <Spinner label={l("처리 중", "Working")} /> : l("반환", "Return")}
                        </button>
                      </div>
                    </>
                  ) : selectedReview.feedback ? (
                    <div className={styles.returnedFeedback}><b>{l("보낸 피드백", "Feedback sent")}</b><p>{selectedReview.feedback}</p></div>
                  ) : null}
                </form>
              )}
            </div>
          ) : (
            <p className={styles.reviewEmpty}>{l("이 목록에는 과제가 없습니다.", "There are no assignments in this queue.")}</p>
          )}
        </section>
      )}
    </section>
  );
}

function reviewQueueLabel(value: "ready" | "assigned" | "returned", locale: "ko" | "en") {
  if (value === "assigned") return locale === "ko" ? "배정됨" : "Assigned";
  if (value === "returned") return locale === "ko" ? "반환됨" : "Returned";
  return locale === "ko" ? "검토 대기" : "Ready to review";
}

function reviewStatus(value: string, locale: "ko" | "en") {
  if (value === "submitted") return locale === "ko" ? "제출됨" : "Turned in";
  if (value === "graded") return locale === "ko" ? "반환 완료" : "Returned";
  if (value === "needs_revision") return locale === "ko" ? "수정 요청" : "Needs revision";
  return locale === "ko" ? "진행 중" : "Assigned";
}

function formatReviewDate(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatReviewDateTime(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
