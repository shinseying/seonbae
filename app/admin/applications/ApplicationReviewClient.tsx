"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./applications.module.css";

export type AccountApplication = {
  id: number;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  requested_role: "student" | "parent" | "tutor";
  acceptance_letter_name: string | null;
  credential_name: string | null;
  credentialUrl: string | null;
  university: string | null;
  subjects: string | null;
  curriculum: string | null;
  official_score: string | null;
  languages: string | null;
  lesson_format: string | null;
  subject_scores: Array<{ subject: string; score: string }>;
  referral_code: string | null;
  contract_signed: boolean;
  status: string;
  notification_sent_at: string | null;
  notification_error: string | null;
  created_at: string;
  documentUrl: string | null;
};

export default function ApplicationReviewClient({ accounts }: { accounts: AccountApplication[] }) {
  const router = useRouter();
  const [accountItems, setAccountItems] = useState(accounts);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => setAccountItems(accounts), [accounts]);

  // Both actions drop the card first and put it back if the server refuses, so
  // the desk never shows a request the admin has already dealt with.
  async function send(id: number, request: RequestInit, pending: string, done: string) {
    const removed = accountItems.find((item) => item.id === id);
    setAccountItems((items) => items.filter((item) => item.id !== id));
    setMessage(pending);

    try {
      const response = await fetch("/api/admin/applications", {
        headers: { "Content-Type": "application/json" },
        ...request,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
      setMessage(done);
      router.refresh();
    } catch (error) {
      if (removed) setAccountItems((items) => [...items, removed].sort(byCreatedAt));
      setMessage(error instanceof Error ? error.message : "네트워크 연결을 확인하고 다시 시도해 주세요.");
    }
  }

  function decide(id: number, decision: "approved" | "rejected") {
    return send(
      id,
      {
        method: "PATCH",
        body: JSON.stringify({ id, decision, note: notes[`account-${id}`] || "" }),
      },
      decision === "approved" ? "승인을 반영하고 있습니다…" : "반려를 반영하고 있습니다…",
      decision === "approved" ? "승인되었습니다." : "반려되었습니다.",
    );
  }

  function remove(item: AccountApplication) {
    const confirmed = window.confirm(
      `${item.full_name} 님의 가입 신청 #${item.id}을 삭제할까요?\n\n신청 기록과 제출 서류가 함께 지워지며 되돌릴 수 없습니다. 계정 자체는 남습니다.`,
    );
    if (!confirmed) return;
    return send(
      item.id,
      { method: "DELETE", body: JSON.stringify({ id: item.id }) },
      "신청을 삭제하고 있습니다…",
      "삭제되었습니다.",
    );
  }

  return (
    <div className={styles.reviewGrid}>
      {message && <p className={styles.message} aria-live="polite">{message}</p>}
      <section>
        <header><div><p>ACCOUNT REQUESTS</p><h2>계정 가입 심사</h2></div><span>{accountItems.length}</span></header>
        {accountItems.length ? accountItems.map((item) => {
          const key = `account-${item.id}`;
          return (
            <article key={key}>
              <div className={styles.title}>
                <div><small>#{item.id} · {roleLabel(item.requested_role)}</small><h3>{item.full_name}</h3><p>{item.email} · {item.phone}</p></div>
                <time>{formatDate(item.created_at)}</time>
              </div>
              {item.documentUrl && item.acceptance_letter_name
                ? <a className={styles.document} href={item.documentUrl} target="_blank" rel="noreferrer">학적증명서 · {item.acceptance_letter_name}</a>
                : <span className={styles.noDocument}>추가 제출 서류 없음</span>}
              {item.credentialUrl && item.credential_name && (
                <a className={styles.document} href={item.credentialUrl} target="_blank" rel="noreferrer">성적 증명 · {item.credential_name}</a>
              )}
              {item.requested_role === "tutor" && (item.university || item.curriculum) && (
                <span className={styles.sent}>
                  {[item.university, item.curriculum, item.languages, item.lesson_format].filter(Boolean).join(" · ")}
                </span>
              )}
              {item.requested_role === "tutor" && item.subject_scores.length > 0 && (
                <ul className={styles.subjectScores}>
                  {item.subject_scores.map((row, index) => (
                    <li key={index}>
                      <b>{row.subject}</b>
                      <span>{row.score}</span>
                    </li>
                  ))}
                </ul>
              )}
              {item.requested_role === "tutor" && item.referral_code && (
                <span className={styles.sent}>추천인 · {item.referral_code}</span>
              )}
              {item.requested_role === "tutor" && item.user_id && (
                <span className={item.contract_signed ? styles.sent : styles.warning}>
                  {item.contract_signed ? "튜터 계약 서명 완료" : "튜터 계약 서명 대기"}
                </span>
              )}
              <span className={item.notification_sent_at ? styles.sent : styles.warning}>
                {item.notification_sent_at ? "admissions 이메일 전송 완료" : "이메일 전송 대기 · 심사는 포털에서 가능"}
              </span>
              <textarea
                aria-label={`${item.full_name} 심사 메모`}
                placeholder="승인 또는 보완 요청 메모"
                value={notes[key] || ""}
                onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
              />
              <div className={styles.actions}>
                <button className={styles.deleteButton} type="button" onClick={() => remove(item)}>삭제</button>
                <button type="button" onClick={() => decide(item.id, "rejected")}>보완 요청</button>
                {item.requested_role === "tutor" && !item.user_id ? (
                  <a className={styles.provisionLink} href="/admin/tutor-accounts">튜터 계정 생성 탭에서 계정 만들기</a>
                ) : (
                  <button
                    type="button"
                    disabled={item.requested_role === "tutor" && !item.contract_signed}
                    onClick={() => decide(item.id, "approved")}
                    title={item.requested_role === "tutor" && !item.contract_signed ? "계약 서명 후 승인할 수 있습니다." : undefined}
                  >계정 승인</button>
                )}
              </div>
            </article>
          );
        }) : <div className={styles.empty}>대기 중인 가입 요청이 없습니다.</div>}
      </section>
    </div>
  );
}

function roleLabel(role: AccountApplication["requested_role"]) {
  if (role === "parent") return "보호자";
  if (role === "tutor") return "튜터";
  return "학생";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function byCreatedAt<T extends { created_at: string }>(left: T, right: T) {
  return Date.parse(left.created_at) - Date.parse(right.created_at);
}
