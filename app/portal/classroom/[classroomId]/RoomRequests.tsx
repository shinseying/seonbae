"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { usePortalText } from "../../PortalLocale";
import styles from "../classroom.module.css";

// The two requests that belong to one room. They sit here rather than on the
// 내 교실 list so that the list stays a set of doors into the rooms.
export function JoinRequests({ requests }: { requests: Array<{ id: number; name: string; role: string }> }) {
  const { text: l } = usePortalText();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function decide(id: number, decision: "approved" | "rejected") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/classroom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setMessage(result?.error || l("처리하지 못했습니다.", "Could not process."));
        return;
      }
      router.refresh();
    } catch {
      setMessage(l("네트워크를 확인해 주세요.", "Check your connection."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.requests}>
      <h2>{l("참여 요청", "Join requests")}</h2>
      {message && <p className={styles.message} role="status">{message}</p>}
      {requests.map((request) => (
        <article key={request.id}>
          <div>
            <b>{request.name}</b>
            <small>{request.role === "parent" ? l("보호자", "Parent") : l("학생", "Student")}</small>
          </div>
          <div className={styles.requestActions}>
            <button type="button" disabled={busy} onClick={() => decide(request.id, "approved")}>
              {l("수락", "Accept")}
            </button>
            <button type="button" className={styles.ghost} disabled={busy} onClick={() => decide(request.id, "rejected")}>
              {l("거절", "Decline")}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

export function EndMatchRequest({ classroomId, title, pending }: { classroomId: number; title: string; pending: boolean }) {
  const { text: l } = usePortalText();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function requestEnd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!window.confirm(l(
      `'${title}' 매칭 종료를 관리자에게 요청할까요? 관리자가 승인하면 예정된 수업이 취소되고 교실은 보관 상태가 됩니다.`,
      `Ask the admin to end the match for '${title}'? Once approved, upcoming lessons are cancelled and the classroom is archived.`,
    ))) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/classroom/end-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroomId, reason: form.get("reason") }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setMessage(result?.error || l("처리하지 못했습니다.", "Could not process."));
        return;
      }
      router.refresh();
    } catch {
      setMessage(l("네트워크를 확인해 주세요.", "Check your connection."));
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <p className={styles.matchNote}>
        {l("매칭 종료 요청이 접수되어 관리자가 검토하고 있습니다.", "An end request is with the admin.")}
      </p>
    );
  }

  return (
    <details className={styles.endRequest}>
      <summary>{l("매칭 종료 요청", "Ask to end this match")}</summary>
      <form onSubmit={requestEnd}>
        <label>
          <span>{l("종료 사유 (선택)", "Reason (optional)")}</span>
          <textarea name="reason" rows={3} maxLength={1000} />
        </label>
        {message && <p className={styles.toolMessage} data-tone="error" role="status">{message}</p>}
        <button type="submit" disabled={busy}>{l("관리자에게 종료 요청", "Send to the admin")}</button>
      </form>
    </details>
  );
}
