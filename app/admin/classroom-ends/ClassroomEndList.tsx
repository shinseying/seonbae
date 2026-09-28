"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../classroom-slots/slots.module.css";

type MatchLabel = { title: string; student: string; tutor: string };

export type EndRequest = MatchLabel & {
  id: number;
  requester: string;
  requesterRole: string;
  reason: string | null;
  status: string;
  reviewedAt: string | null;
  createdAt: string;
};

export type ActiveMatch = MatchLabel & { id: number };

export type EndedMatch = MatchLabel & {
  id: number;
  endedAt: string;
  purgeAfter: string;
  reason: string | null;
};

const ROLE_LABEL: Record<string, string> = { student: "학생", parent: "보호자", tutor: "튜터" };

export default function ClassroomEndList({
  requests,
  active,
  ended,
}: {
  requests: EndRequest[];
  active: ActiveMatch[];
  ended: EndedMatch[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function send(key: string, method: "PATCH" | "POST", payload: unknown) {
    setBusy(key);
    setMessage("");
    try {
      const response = await fetch("/api/admin/classroom-ends", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error || "처리하지 못했습니다.");
        return;
      }
      if (result?.endedAt) {
        const mails = result.notified ? ` 학생·보호자·튜터에게 안내 메일 ${result.notified.sent}건을 보냈습니다.` : "";
        const failedMails = result.notified?.failed ? ` (${result.notified.failed}건 발송 실패)` : "";
        setMessage(`매칭을 종료했습니다. 예정된 수업 ${result.cancelledLessons}건을 취소했습니다.${mails}${failedMails}`);
      }
      router.refresh();
    } catch {
      setMessage("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  function approve(request: EndRequest) {
    if (!window.confirm(`'${request.title}' 매칭을 종료할까요? 예정된 수업과 Zoom 회의가 취소되고 교실은 7일 뒤 삭제됩니다.`)) return;
    void send(`request-${request.id}`, "PATCH", { requestId: request.id, decision: "approved" });
  }

  function endDirectly(match: ActiveMatch) {
    const field = document.getElementById(`end-reason-${match.id}`) as HTMLInputElement | null;
    if (!window.confirm(`'${match.title}' (${match.student} · ${match.tutor}) 매칭을 지금 종료할까요? 예정된 수업과 Zoom 회의가 취소되고 교실은 7일 뒤 삭제됩니다.`)) return;
    void send(`room-${match.id}`, "POST", { classroomId: match.id, reason: field?.value || "" });
  }

  return (
    <div className={styles.list}>
      {message && <p className={styles.message} role="status">{message}</p>}

      <h2>종료 요청</h2>
      {requests.length === 0 ? (
        <div className={styles.empty}>매칭 종료 요청이 없습니다.</div>
      ) : requests.map((request) => (
        <article key={request.id} data-status={request.status}>
          <header>
            <div>
              <b>{request.title}</b>
              <small>
                학생 {request.student} · 튜터 {request.tutor} · 요청자 {request.requester}
                ({ROLE_LABEL[request.requesterRole] || request.requesterRole}) · {formatDate(request.createdAt)}
              </small>
            </div>
            <span data-status={request.status}>{statusLabel(request.status)}</span>
          </header>
          <p className={styles.reason}>{request.reason || "사유 없음"}</p>
          {request.status === "pending" ? (
            <div className={styles.actions}>
              <button type="button" className={styles.approve} disabled={busy !== null} onClick={() => approve(request)}>
                승인하고 종료
              </button>
              <button
                type="button"
                className={styles.ghost}
                disabled={busy !== null}
                onClick={() => send(`request-${request.id}`, "PATCH", { requestId: request.id, decision: "rejected" })}
              >
                거절
              </button>
            </div>
          ) : (
            <p className={styles.decided}>
              {statusLabel(request.status)}
              {request.reviewedAt ? ` · ${formatDate(request.reviewedAt)}` : ""}
            </p>
          )}
        </article>
      ))}

      <h2>진행 중인 매칭</h2>
      {active.length === 0 ? (
        <div className={styles.empty}>진행 중인 매칭이 없습니다.</div>
      ) : active.map((match) => (
        <article key={match.id}>
          <header>
            <div>
              <b>{match.title}</b>
              <small>학생 {match.student} · 튜터 {match.tutor}</small>
            </div>
          </header>
          <div className={styles.actions}>
            <label>
              <span>종료 사유 (선택)</span>
              <input id={`end-reason-${match.id}`} maxLength={1000} />
            </label>
            <button type="button" className={styles.ghost} disabled={busy !== null} onClick={() => endDirectly(match)}>
              매칭 종료
            </button>
          </div>
        </article>
      ))}

      {ended.length > 0 && (
        <>
          <h2>종료된 매칭 (보관 중)</h2>
          {ended.map((match) => (
            <article key={match.id} data-status="rejected">
              <header>
                <div>
                  <b>{match.title}</b>
                  <small>
                    학생 {match.student} · 튜터 {match.tutor} · 종료 {formatDate(match.endedAt)} · 삭제 예정 {formatDate(match.purgeAfter)}
                  </small>
                </div>
              </header>
              {match.reason && <p className={styles.reason}>{match.reason}</p>}
            </article>
          ))}
        </>
      )}
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "approved") return "종료됨";
  if (status === "rejected") return "거절";
  return "대기";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
