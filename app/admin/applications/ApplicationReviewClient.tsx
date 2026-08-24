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
  subject_scores: Array<{
    subject: string;
    score: string;
    proofName: string | null;
    proofUrl: string | null;
  }>;
  referral_code: string | null;
  contract_signed: boolean;
  status: string;
  notification_sent_at: string | null;
  notification_error: string | null;
  created_at: string;
  documentUrl: string | null;
};

export type CredentialApplication = {
  id: number;
  tutor_id: string;
  tutor_registry_id: string | null;
  tutorName: string;
  credential_type: string;
  title: string;
  issuer: string;
  score: string | null;
  issued_on: string | null;
  proof_name: string;
  status: string;
  created_at: string;
  documentUrl: string | null;
};

// One tab renders one queue. `show` picks which, so the two lists no longer
// stack on the same page.
export default function ApplicationReviewClient({
  accounts,
  credentials,
  show = "both",
}: {
  accounts: AccountApplication[];
  credentials: CredentialApplication[];
  show?: "accounts" | "credentials" | "both";
}) {
  const router = useRouter();
  const [accountItems, setAccountItems] = useState(accounts);
  const [credentialItems, setCredentialItems] = useState(credentials);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => setAccountItems(accounts), [accounts]);
  useEffect(() => setCredentialItems(credentials), [credentials]);

  async function decide(kind: "account" | "credential", id: number, decision: "approved" | "rejected") {
    const key = `${kind}-${id}`;
    const removed = kind === "account"
      ? accountItems.find((item) => item.id === id)
      : credentialItems.find((item) => item.id === id);

    if (kind === "account") setAccountItems((items) => items.filter((item) => item.id !== id));
    else setCredentialItems((items) => items.filter((item) => item.id !== id));
    setMessage(decision === "approved" ? "승인을 반영하고 있습니다…" : "반려를 반영하고 있습니다…");

    try {
      const response = await fetch("/api/admin/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, decision, note: notes[key] || "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "심사 결과를 저장하지 못했습니다.");

      setMessage(decision === "approved" ? "승인되었습니다." : "반려되었습니다.");
      router.refresh();
    } catch (error) {
      if (removed) {
        if (kind === "account") {
          setAccountItems((items) => [...items, removed as AccountApplication].sort(byCreatedAt));
        } else {
          setCredentialItems((items) => [...items, removed as CredentialApplication].sort(byCreatedAt));
        }
      }
      setMessage(error instanceof Error ? error.message : "네트워크 연결을 확인하고 다시 시도해 주세요.");
    }
  }

  return (
    <div className={styles.reviewGrid}>
      {message && <p className={styles.message} aria-live="polite">{message}</p>}
      {show !== "credentials" && (
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
                <a className={styles.document} href={item.credentialUrl} target="_blank" rel="noreferrer">성적·자격 증빙 · {item.credential_name}</a>
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
                      {row.proofUrl
                        ? <a href={row.proofUrl} target="_blank" rel="noreferrer">{row.proofName || "증빙"} ↗</a>
                        : <em>증빙 없음</em>}
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
                <button type="button" onClick={() => decide("account", item.id, "rejected")}>보완 요청</button>
                {item.requested_role === "tutor" && !item.user_id ? (
                  <a className={styles.provisionLink} href="/admin/tutor-accounts">튜터 계정 생성 탭에서 계정 만들기</a>
                ) : (
                  <button
                    type="button"
                    disabled={item.requested_role === "tutor" && !item.contract_signed}
                    onClick={() => decide("account", item.id, "approved")}
                    title={item.requested_role === "tutor" && !item.contract_signed ? "계약 서명 후 승인할 수 있습니다." : undefined}
                  >계정 승인</button>
                )}
              </div>
            </article>
          );
        }) : <div className={styles.empty}>대기 중인 가입 요청이 없습니다.</div>}
      </section>
      )}
      {show !== "accounts" && (
      <section>
        <header><div><p>TUTOR CREDENTIALS</p><h2>튜터 자격 검증</h2></div><span>{credentialItems.length}</span></header>
        {credentialItems.length ? credentialItems.map((item) => {
          const key = `credential-${item.id}`;
          return (
            <article key={key}>
              <div className={styles.title}>
                <div><small>#{item.id} · {item.credential_type}</small><h3>{item.title}</h3><p>{item.tutorName} · {item.issuer}{item.score ? ` · ${item.score}` : ""}</p></div>
                <time>{formatDate(item.created_at)}</time>
              </div>
              <a className={styles.document} href={item.documentUrl || undefined} target="_blank" rel="noreferrer" aria-disabled={!item.documentUrl}>원본 증빙 · {item.proof_name}</a>
              <textarea
                aria-label={`${item.tutorName} 자격 검증 메모`}
                placeholder="검증 결과 또는 보완 요청 메모"
                value={notes[key] || ""}
                onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
              />
              <div className={styles.actions}>
                <button type="button" onClick={() => decide("credential", item.id, "rejected")}>보완 요청</button>
                <button type="button" onClick={() => decide("credential", item.id, "approved")}>검증 승인</button>
              </div>
            </article>
          );
        }) : <div className={styles.empty}>대기 중인 자격 자료가 없습니다.</div>}
      </section>
      )}
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
