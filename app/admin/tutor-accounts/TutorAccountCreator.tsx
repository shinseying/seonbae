"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../applications/applications.module.css";

export type PendingTutorApplication = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  university: string | null;
  subjects: string | null;
  created_at: string;
};

export default function TutorAccountCreator({
  applications,
}: {
  applications: PendingTutorApplication[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(applications);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function create(payload: Record<string, unknown>, key: string, onDone?: () => void) {
    setBusy(key);
    setMessage("계정을 만들고 비밀번호 설정 링크를 보내는 중입니다…");
    try {
      const response = await fetch("/api/admin/tutor-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "계정을 만들지 못했습니다.");
      setMessage(result.warning || "계정을 만들고 일회용 비밀번호 설정 링크를 이메일로 보냈습니다.");
      onDone?.();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "네트워크 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  function createDirect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create(
      {
        fullName: data.get("fullName"),
        email: data.get("email"),
        phone: data.get("phone"),
      },
      "direct",
      () => form.reset(),
    );
  }

  return (
    <div className={styles.reviewGrid}>
      {message && <p className={styles.message} aria-live="polite">{message}</p>}

      <section>
        <header>
          <div>
            <p>CREATE DIRECTLY</p>
            <h2>새 튜터 계정</h2>
          </div>
        </header>
        <article>
          <form onSubmit={createDirect} className={styles.createForm}>
            <label>
              <span>이름</span>
              <input name="fullName" minLength={2} maxLength={80} required />
            </label>
            <label>
              <span>학교 이메일</span>
              <input name="email" type="email" maxLength={254} required placeholder="tutor@snu.ac.kr" />
            </label>
            <label>
              <span>휴대전화번호</span>
              <input name="phone" type="tel" inputMode="tel" maxLength={24} placeholder="01012345678" required />
            </label>
            <div className={styles.actions}>
              <button type="submit" disabled={busy === "direct"}>
                {busy === "direct" ? "생성 중…" : "계정 생성 후 설정 링크 발송"}
              </button>
            </div>
          </form>
        </article>
      </section>

      <section>
        <header>
          <div>
            <p>FROM APPLICATIONS</p>
            <h2>지원서에서 생성</h2>
          </div>
          <span>{pending.length}</span>
        </header>
        {pending.length ? pending.map((item) => (
          <article key={item.id}>
            <div className={styles.title}>
              <div>
                <small>#{item.id} · 튜터 지원</small>
                <h3>{item.full_name}</h3>
                <p>{item.email} · {item.phone}</p>
              </div>
              <time>{formatDate(item.created_at)}</time>
            </div>
            {(item.university || item.subjects) && (
              <span className={styles.sent}>
                {[item.university, item.subjects].filter(Boolean).join(" · ")}
              </span>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                disabled={busy === `request-${item.id}`}
                onClick={() =>
                  create({ requestId: item.id }, `request-${item.id}`, () =>
                    setPending((items) => items.filter((row) => row.id !== item.id)),
                  )
                }
              >
                {busy === `request-${item.id}` ? "생성 중…" : "튜터 계정 생성"}
              </button>
            </div>
          </article>
        )) : <div className={styles.empty}>계정을 기다리는 지원서가 없습니다.</div>}
      </section>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
