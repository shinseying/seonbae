"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Complaint = {
  id: number;
  authorName: string;
  authorRole: string;
  body: string;
  status: "new" | "resolved";
  adminNote: string | null;
  createdAt: string;
};

export default function ComplaintList({
  complaints,
  styles,
}: {
  complaints: Complaint[];
  styles: Record<string, string>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function setStatus(id: number, status: "resolved" | "new") {
    setBusyId(id);
    try {
      await fetch("/api/complaints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!complaints.length) {
    return <p className={styles.empty || undefined}>접수된 컴플레인이 없습니다.</p>;
  }

  return (
    <ul className={styles.cardList || undefined} style={{ listStyle: "none", display: "grid", gap: 16, padding: 0 }}>
      {complaints.map((item) => (
        <li
          key={item.id}
          style={{
            border: "1px solid rgba(19,24,27,.12)",
            borderRadius: 12,
            padding: 20,
            background: item.status === "resolved" ? "rgba(19,24,27,.03)" : "#fffdf7",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            <b>
              {item.authorName} <small style={{ fontWeight: 400, opacity: 0.6 }}>· {roleLabel(item.authorRole)}</small>
            </b>
            <small style={{ opacity: 0.6 }}>{formatDate(item.createdAt)}</small>
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: "0 0 12px" }}>{item.body}</p>
          {item.status === "resolved" ? (
            <button type="button" onClick={() => setStatus(item.id, "new")} disabled={busyId === item.id}>
              다시 열기
            </button>
          ) : (
            <button type="button" onClick={() => setStatus(item.id, "resolved")} disabled={busyId === item.id}>
              처리 완료
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function roleLabel(role: string) {
  if (role === "parent") return "보호자";
  if (role === "tutor") return "튜터";
  if (role === "student") return "학생";
  return role;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
