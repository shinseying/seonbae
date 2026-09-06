"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  canTurnIn,
  canUndoTurnIn,
  homeworkGroup,
  type HomeworkGroup,
  type HomeworkStatus,
} from "../../../utils/homework/workflow";
import styles from "./homework.module.css";
import { usePortalText } from "../PortalLocale";

export type HomeworkItem = {
  id: number;
  studentName: string;
  subject: string;
  title: string;
  instructions: string;
  dueDate: string;
  attachmentName: string | null;
  studentAttachmentName: string | null;
  status: HomeworkStatus;
  submittedAt: string | null;
  feedback: string | null;
  gradedAt: string | null;
  tutorName: string;
};

const GROUPS: HomeworkGroup[] = ["assigned", "submitted", "returned"];

export default function HomeworkList({
  assignments,
  role,
}: {
  assignments: HomeworkItem[];
  role: "student" | "parent";
}) {
  const { locale, text: l } = usePortalText();
  const [items, setItems] = useState(assignments);
  const [filter, setFilter] = useState<HomeworkGroup>(() => firstPopulatedGroup(assignments));
  const [selectedId, setSelectedId] = useState<number | null>(assignments[0]?.id ?? null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");

  useEffect(() => setItems(assignments), [assignments]);

  const counts = useMemo(() => ({
    assigned: items.filter((item) => homeworkGroup(item.status) === "assigned").length,
    submitted: items.filter((item) => homeworkGroup(item.status) === "submitted").length,
    returned: items.filter((item) => homeworkGroup(item.status) === "returned").length,
  }), [items]);
  const visible = useMemo(
    () => items.filter((item) => homeworkGroup(item.status) === filter),
    [items, filter],
  );
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  function chooseGroup(group: HomeworkGroup) {
    setFilter(group);
    const first = items.find((item) => homeworkGroup(item.status) === group);
    setSelectedId(first?.id ?? null);
    setMessage("");
  }

  async function turnIn(event: FormEvent<HTMLFormElement>, item: HomeworkItem) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("action", "submit");
    form.set("assignmentId", String(item.id));
    setBusyId(item.id);
    setMessage("");
    try {
      const response = await fetch("/api/homework", { method: "POST", body: form });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || l("과제를 제출하지 못했습니다.", "The assignment could not be turned in."));
      const uploaded = form.get("studentAttachment");
      setItems((current) => current.map((row) => row.id === item.id ? {
        ...row,
        status: "submitted",
        submittedAt: result?.submitted_at ?? new Date().toISOString(),
        studentAttachmentName: uploaded instanceof File && uploaded.size > 0
          ? uploaded.name
          : row.studentAttachmentName,
      } : row));
      setTone("ok");
      setMessage(l("제출했습니다. 튜터가 검토하면 이곳에서 피드백을 확인할 수 있습니다.", "Turned in. Feedback will appear here after your tutor reviews it."));
      setFilter("submitted");
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : l("다시 시도해 주세요.", "Please try again."));
    } finally {
      setBusyId(null);
    }
  }

  async function undoTurnIn(item: HomeworkItem) {
    setBusyId(item.id);
    setMessage("");
    try {
      const response = await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo", assignmentId: item.id }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || l("제출을 취소하지 못했습니다.", "The turn-in could not be undone."));
      setItems((current) => current.map((row) => row.id === item.id ? {
        ...row,
        status: "todo",
        submittedAt: null,
      } : row));
      setTone("ok");
      setMessage(l("제출을 취소했습니다. 수정한 뒤 다시 제출할 수 있습니다.", "Turn-in undone. You can edit your work and submit it again."));
      setFilter("assigned");
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : l("다시 시도해 주세요.", "Please try again."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.board}>
      <div className={styles.filters} role="tablist" aria-label={l("과제 상태", "Assignment status")}>
        {GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            role="tab"
            aria-selected={filter === group}
            data-active={filter === group}
            onClick={() => chooseGroup(group)}
          >
            {groupLabel(group, locale)}
            <span>{counts[group]}</span>
          </button>
        ))}
      </div>

      {message && <p className={styles.notice} data-tone={tone} role="status" aria-live="polite">{message}</p>}

      {visible.length ? (
        <div className={styles.workspace}>
          <div className={styles.assignmentList} role="list" aria-label={groupLabel(filter, locale)}>
            <div className={styles.listHead} aria-hidden="true">
              <span>{l("과제", "Assignment")}</span>
              <span>{l("마감", "Due")}</span>
            </div>
            {visible.map((item) => (
              <button
                type="button"
                role="listitem"
                className={styles.assignmentRow}
                data-selected={selected?.id === item.id}
                onClick={() => { setSelectedId(item.id); setMessage(""); }}
                key={item.id}
              >
                <span className={styles.rowMain}>
                  <span className={styles.statusDot} data-status={item.status} aria-hidden="true" />
                  <span>
                    <b>{item.title}</b>
                    <small>{role === "parent" ? `${item.studentName} · ` : ""}{item.subject}</small>
                  </span>
                </span>
                <span className={styles.rowDue} data-late={isLate(item)}>{shortDate(item.dueDate, locale)}</span>
              </button>
            ))}
          </div>

          {selected && (
            <article className={styles.detail} aria-live="polite">
              <header className={styles.detailHead}>
                <div>
                  <span className={styles.subject}>{selected.subject}</span>
                  <h2>{selected.title}</h2>
                  <p>{role === "parent" && `${selected.studentName} · `}{selected.tutorName}{l(" 튜터", ", tutor")}</p>
                </div>
                <span className={styles.status} data-status={selected.status}>{statusLabel(selected.status, locale)}</span>
              </header>

              <dl className={styles.summary}>
                <div><dt>{l("마감", "Due")}</dt><dd data-late={isLate(selected)}>{formatDate(selected.dueDate, locale)}{isLate(selected) ? l(" · 지남", " · late") : ""}</dd></div>
                <div><dt>{l("상태", "Status")}</dt><dd>{statusLabel(selected.status, locale)}</dd></div>
                <div><dt>{l("제출 시각", "Turned in")}</dt><dd>{selected.submittedAt ? formatDateTime(selected.submittedAt, locale) : "—"}</dd></div>
              </dl>

              <section className={styles.detailSection}>
                <h3>{l("안내", "Instructions")}</h3>
                <p className={styles.instructions}>{selected.instructions}</p>
                {selected.attachmentName && (
                  <a className={styles.fileLink} href={`/api/homework?file=${selected.id}`} target="_blank" rel="noreferrer">
                    <span aria-hidden="true">↗</span>
                    <span><b>{l("참고 자료", "Reference material")}</b><small>{selected.attachmentName}</small></span>
                  </a>
                )}
              </section>

              {(selected.status === "needs_revision" || selected.status === "graded") && (
                <section className={styles.feedback} data-revision={selected.status === "needs_revision"}>
                  <span>{selected.status === "needs_revision" ? l("수정 요청", "Revision requested") : l("튜터 피드백", "Tutor feedback")}</span>
                  <p>{selected.feedback || l("등록된 피드백이 없습니다.", "No written feedback was added.")}</p>
                </section>
              )}

              <section className={styles.myWork}>
                <div className={styles.sectionTitle}>
                  <div>
                    <h3>{l("내 작업", "My work")}</h3>
                    <p>{l("파일을 첨부하거나 준비가 끝난 과제를 바로 제출하세요.", "Attach a file, or turn in the assignment when your work is ready.")}</p>
                  </div>
                  {selected.studentAttachmentName && (
                    <a href={`/api/homework?submission=${selected.id}`} target="_blank" rel="noreferrer">
                      {selected.studentAttachmentName} ↗
                    </a>
                  )}
                </div>

                {role === "student" && canTurnIn(selected.status) && (
                  <form className={styles.turnInForm} onSubmit={(event) => turnIn(event, selected)}>
                    <label>
                      <span>{l("작업 파일", "Work file")}</span>
                      <input type="file" name="studentAttachment" accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,.xlsx,.pptx" />
                      <small>{l("선택 · PDF, 이미지, TXT, Word, Excel, PowerPoint · 최대 10MB", "Optional · PDF, image, TXT, Word, Excel, or PowerPoint · 10 MB max")}</small>
                    </label>
                    <button type="submit" disabled={busyId === selected.id}>
                      {busyId === selected.id
                        ? l("제출 중…", "Turning in…")
                        : selected.status === "needs_revision"
                          ? l("다시 제출", "Turn in again")
                          : l("제출", "Turn in")}
                    </button>
                  </form>
                )}

                {role === "student" && canUndoTurnIn(selected.status) && (
                  <div className={styles.submittedActions}>
                    <p>{l("튜터에게 제출되었습니다. 검토 전에는 제출을 취소하고 다시 수정할 수 있습니다.", "This is with your tutor. You can undo the turn-in before it is returned.")}</p>
                    <button type="button" disabled={busyId === selected.id} onClick={() => undoTurnIn(selected)}>
                      {busyId === selected.id ? l("처리 중…", "Working…") : l("제출 취소", "Undo turn in")}
                    </button>
                  </div>
                )}

                {role === "parent" && (
                  <p className={styles.readOnly}>{l("보호자 계정에서는 과제와 피드백을 확인할 수 있으며, 제출은 학생 계정에서 진행합니다.", "Parents can review assignments and feedback; work is turned in from the student account.")}</p>
                )}
              </section>
            </article>
          )}
        </div>
      ) : (
        <div className={styles.empty}>
          <b>{l("이 목록에는 아직 과제가 없습니다.", "There are no assignments in this list yet.")}</b>
          <span>{l("상태가 바뀌면 과제가 자동으로 해당 목록으로 이동합니다.", "Assignments move here automatically as their status changes.")}</span>
        </div>
      )}
    </section>
  );
}

function firstPopulatedGroup(items: HomeworkItem[]): HomeworkGroup {
  return GROUPS.find((group) => items.some((item) => homeworkGroup(item.status) === group)) ?? "assigned";
}

function groupLabel(value: HomeworkGroup, locale: "ko" | "en") {
  if (value === "submitted") return locale === "ko" ? "제출됨" : "Turned in";
  if (value === "returned") return locale === "ko" ? "반환됨" : "Returned";
  return locale === "ko" ? "할 일" : "Assigned";
}

function statusLabel(value: HomeworkStatus, locale: "ko" | "en") {
  if (value === "submitted") return locale === "ko" ? "검토 대기" : "Waiting for review";
  if (value === "graded") return locale === "ko" ? "반환 완료" : "Returned";
  if (value === "needs_revision") return locale === "ko" ? "수정 필요" : "Needs revision";
  return locale === "ko" ? "할 일" : "Assigned";
}

function isLate(item: HomeworkItem) {
  if (!canTurnIn(item.status)) return false;
  return new Date(`${item.dueDate}T23:59:59`).getTime() < Date.now();
}

function shortDate(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" })
    .format(new Date(`${value}T00:00:00`));
}

function formatDate(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
