"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../applications/applications.module.css";

export type CardRequest = {
  id: number;
  tutorName: string;
  registryId: string;
  note: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

const DAY_KO: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};

export default function CardRequestList({ requests }: { requests: CardRequest[] }) {
  const router = useRouter();
  const [items, setItems] = useState(requests);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function decide(id: number, decision: "applied" | "rejected") {
    setBusy(id);
    setMessage(decision === "applied" ? "카드에 반영하는 중입니다…" : "요청을 반려하는 중입니다…");
    try {
      const response = await fetch("/api/admin/card-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, note: notes[id] || "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "처리하지 못했습니다.");
      setItems((rows) => rows.filter((row) => row.id !== id));
      setMessage(decision === "applied" ? "카드에 반영했습니다." : "요청을 반려했습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "네트워크 연결을 확인해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) {
    return <div className={styles.empty}>대기 중인 카드 변경 요청이 없습니다.</div>;
  }

  return (
    <div className={styles.reviewGrid}>
      {message && <p className={styles.message} aria-live="polite">{message}</p>}
      <section>
        <header>
          <div><p>CARD CHANGES</p><h2>튜터 카드 변경 요청</h2></div>
          <span>{items.length}</span>
        </header>
        {items.map((item) => (
          <article key={item.id}>
            <div className={styles.title}>
              <div>
                <small>#{item.id} · {item.registryId}</small>
                <h3>{item.tutorName}</h3>
              </div>
              <time>{formatDate(item.createdAt)}</time>
            </div>

            <dl className={styles.diff}>
              {describe(item.payload).map((line) => (
                <div key={line.label}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>

            {item.note && <p className={styles.requestNote}>{item.note}</p>}

            <textarea
              aria-label={`${item.tutorName} 검토 메모`}
              placeholder="반려 사유 또는 메모"
              value={notes[item.id] || ""}
              onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
            />
            <div className={styles.actions}>
              <button type="button" disabled={busy === item.id} onClick={() => decide(item.id, "rejected")}>반려</button>
              <button type="button" disabled={busy === item.id} onClick={() => decide(item.id, "applied")}>
                {busy === item.id ? "반영 중…" : "카드에 반영"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

// Only the fields the tutor actually filled in, so the admin reads a change
// rather than a full dump of the card.
function describe(payload: Record<string, unknown>) {
  const lines: Array<{ label: string; value: string }> = [];

  const scores = Array.isArray(payload.subject_scores) ? payload.subject_scores : [];
  if (scores.length) {
    lines.push({
      label: "과목별 성적",
      value: scores.map((row) => `${(row as { subject: string }).subject} · ${(row as { score: string }).score}`).join(", "),
    });
  }

  const availability = (payload.availability ?? {}) as Record<string, string[]>;
  const days = Object.entries(availability).filter(([, ranges]) => ranges?.length);
  if (days.length) {
    lines.push({
      label: "가능 시간",
      value: days.map(([day, ranges]) => `${DAY_KO[day] || day} ${ranges.join(", ")}`).join(" / "),
    });
  }

  const simple: Array<[string, string]> = [
    ["bio", "소개 (한국어)"],
    ["bio_en", "소개 (영어)"],
    ["video_url", "샘플 영상"],
    ["languages", "언어"],
    ["lesson_format", "수업 형식"],
  ];
  for (const [key, label] of simple) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) lines.push({ label, value });
  }

  return lines.length ? lines : [{ label: "변경 내용", value: "비우기 요청" }];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
