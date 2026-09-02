"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSeonbaeLocale } from "../../../utils/i18n/client";
import styles from "./verify.module.css";

export default function LoginVerificationPage() {
  const router = useRouter();
  const locale = useSeonbaeLocale();
  const l = (ko: string, en: string) => locale === "ko" ? ko : en;
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/step-up", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        setPending(Boolean(body.challengePending));
        setEmail(body.email || "");
        setLoading(false);
      })
      .catch(() => {
        setMessage(l("보안 세션을 확인하지 못했습니다.", "We could not check your secure session."));
        setLoading(false);
      });
  }, [router]);

  async function sendCode() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/step-up", { method: "PUT" });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || l("인증 코드를 보내지 못했습니다.", "We could not send the code."));
        return;
      }
      setEmail(result.email || email);
      setPending(true);
      setMessage(l("새 인증 코드를 보냈습니다.", "A new verification code has been sent."));
    } catch {
      setMessage(l("네트워크 연결을 확인해 주세요.", "Check your network connection."));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.needsChallenge) setPending(false);
        setMessage(result.error || l("인증 코드를 다시 확인해 주세요.", "Check the verification code."));
        return;
      }
      router.replace(result.destination || "/portal");
      router.refresh();
    } catch {
      setMessage(l("네트워크 연결을 확인해 주세요.", "Check your network connection."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <Link className={styles.brand} href="/" aria-label="Seonbae home">
        <img src="/logo.png" alt="" width="58" height="45" />
        <b>Seonbae</b>
      </Link>
      <section className={styles.card} aria-busy={loading || busy}>
        <p className={styles.eyebrow}>TWO-STEP VERIFICATION</p>
        <h1>{l("한 번 더 확인할게요.", "One more quick check.")}</h1>
        {loading ? (
          <div className={styles.skeleton} aria-label={l("불러오는 중", "Loading")} />
        ) : (
          <>
            <p className={styles.copy}>
              {pending
                ? l(`${email}로 보낸 6자리 코드를 입력해 주세요.`, `Enter the six-digit code sent to ${email}.`)
                : l("인증 코드가 없거나 만료되었습니다. 아래 버튼으로 새 코드를 받아 주세요.", "Your code is missing or expired. Request a new one below.")}
            </p>
            {pending ? (
              <form onSubmit={verify}>
                <label htmlFor="verification-code">{l("인증 코드", "Verification code")}</label>
                <input
                  id="verification-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  autoFocus
                  required
                />
                <button type="submit" disabled={busy || code.length !== 6}>
                  {busy ? l("확인 중…", "Verifying…") : l("인증하고 포털 열기", "Verify and open portal")}
                </button>
              </form>
            ) : (
              <button className={styles.primary} type="button" onClick={sendCode} disabled={busy}>
                {busy ? l("보내는 중…", "Sending…") : l("인증 코드 받기", "Send verification code")}
              </button>
            )}
            {pending && (
              <button className={styles.resend} type="button" onClick={sendCode} disabled={busy}>
                {l("새 코드 보내기", "Send a new code")}
              </button>
            )}
            {message && <p className={styles.message} role="status">{message}</p>}
          </>
        )}
      </section>
    </main>
  );
}
