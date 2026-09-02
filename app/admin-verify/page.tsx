"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin-verify.module.css";

export default function AdminVerifyPage() {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((session) => {
        if (!session.authenticated || session.role !== "admin") {
          router.replace("/login");
          return;
        }
        if (session.destination !== "/admin-verify") {
          router.replace(session.destination || "/admin-shell");
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/admin-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "보안 문구를 확인하지 못했습니다.");
        return;
      }
      router.replace(result.destination || "/admin-shell");
      router.refresh();
    } catch {
      setMessage("네트워크 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <Link className={styles.brand} href="/">
        <img src="/logo.png" alt="" width="58" height="45" />
        <b>Seonbae</b>
      </Link>
      <section className={styles.card} aria-busy={checking || busy}>
        <p>ADMIN SECURITY</p>
        <h1>추가 확인</h1>
        <span>관리자 보안 문구를 입력해 주세요.</span>
        {checking ? <div className={styles.skeleton} /> : (
          <form onSubmit={submit}>
            <label htmlFor="admin-phrase">보안 문구</label>
            <input
              id="admin-phrase"
              type="password"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              autoComplete="off"
              maxLength={128}
              autoFocus
              required
            />
            {message && <strong role="status">{message}</strong>}
            <button type="submit" disabled={busy || !phrase}>
              {busy ? "확인 중…" : "계속"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
