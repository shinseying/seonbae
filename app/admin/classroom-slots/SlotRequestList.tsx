"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./slots.module.css";

export type SlotRequest = {
  id: number;
  registryId: string;
  tutorName: string;
  reason: string | null;
  status: string;
  granted: number | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  currentLimit: number;
  currentRooms: number;
};

export default function SlotRequestList({ requests }: { requests: SlotRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function decide(id: number, decision: "approved" | "rejected", granted: number) {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/classroom-slots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, granted }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error || "처리하지 못했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setMessage("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  if (!requests.length) {
    return <div className={styles.empty}>추가 교실 요청이 없습니다.</div>;
  }

  return (
    <div className={styles.list}>
      {message && <p className={styles.message} role="alert">{message}</p>}
      {requests.map((request) => (
        <article key={request.id} data-status={request.status}>
          <header>
            <div>
              <b>{request.tutorName}</b>
              <small>{request.registryId} · 현재 {request.currentRooms}/{request.currentLimit}개</small>
            </div>
            <span data-status={request.status}>{statusLabel(request.status)}</span>
          </header>
          {request.reason && <p className={styles.reason}>{request.reason}</p>}
          {request.status === "pending" ? (
            <div className={styles.actions}>
              <label>
                <span>추가 개수</span>
                <select id={`granted-${request.id}`} defaultValue="1">
                  {[1, 2, 3, 5].map((count) => <option value={count} key={count}>{count}개</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={busy === request.id}
                onClick={() => {
                  const select = document.getElementById(`granted-${request.id}`) as HTMLSelectElement | null;
                  decide(request.id, "approved", Number(select?.value || 1));
                }}
              >
                승인
              </button>
              <button
                type="button"
                className={styles.ghost}
                disabled={busy === request.id}
                onClick={() => decide(request.id, "rejected", 1)}
              >
                거절
              </button>
            </div>
          ) : (
            <p className={styles.decided}>
              {request.granted ? `${request.granted}개 추가 승인` : "거절"}
              {request.reviewedAt ? ` · ${formatDate(request.reviewedAt)}` : ""}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "approved") return "승인";
  if (status === "rejected") return "거절";
  return "대기";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(new Date(value));
}
