"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../parent.module.css";
import { usePortalText } from "../PortalLocale";

export type LinkedStudent = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

type Method = "phone" | "email";

export default function FamilyLinkClient({
  linkedStudents,
}: {
  linkedStudents: LinkedStudent[];
}) {
  const router = useRouter();
  const { text: l } = usePortalText();
  // Phone OTP is off until SMS delivery is provisioned.
  const [method, setMethod] = useState<Method>("email");
  const [target, setTarget] = useState("");
  const [challenge, setChallenge] = useState("");
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<"identify" | "verify" | "success">("identify");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/parent-link/request", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, target }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || l("인증 요청을 보내지 못했습니다.", "The verification request could not be sent."));
        return;
      }
      setChallenge(result.challenge);
      setMessage(result.message);
      setPhase("verify");
    } catch {
      setMessage(l("네트워크 연결을 확인한 뒤 다시 시도해 주세요.", "Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/parent-link/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, token }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || l("인증번호를 확인하지 못했습니다.", "The verification code could not be confirmed."));
        return;
      }
      setPhase("success");
      setMessage(result.message);
      router.refresh();
    } catch {
      setMessage(l("네트워크 연결을 확인한 뒤 다시 시도해 주세요.", "Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setPhase("identify");
    setChallenge("");
    setToken("");
    setMessage("");
  }

  return (
    <div className={styles.twoColumn}>
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <span>{l("현재 연결", "Current connections")}</span>
          <h2>{l("연결된 학생", "Linked students")}</h2>
        </div>
        {linkedStudents.length ? (
          <div className={styles.studentList}>
            {linkedStudents.map((student) => (
              <article key={student.id}>
                <span className={styles.studentInitial}>{student.name.slice(-2)}</span>
                <div>
                  <strong>{student.name}</strong>
                  <p>{student.email}</p>
                </div>
                <small>{student.phone}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>{l("연결된 학생이 없습니다.", "No students are linked yet.")}</strong>
            <p>{l("오른쪽 인증 절차를 완료하면 학생 일정과 리포트가 포털에 표시됩니다.", "Complete verification to show the student's schedule and reports in the portal.")}</p>
          </div>
        )}
      </section>

      <section className={`${styles.panel} ${styles.verificationPanel}`}>
        <div className={styles.sectionHeading}>
          <span>{l("2단계 확인", "Two-step verification")}</span>
          <h2>{phase === "success" ? l("연결 완료", "Connection complete") : l("새 학생 연결", "Link a new student")}</h2>
        </div>

        {phase === "identify" && (
          <form className={styles.form} onSubmit={requestOtp}>
            <fieldset className={styles.methodChoice}>
              <legend>{l("인증 방법", "Verification method")}</legend>
              <label data-selected={method === "phone"} data-disabled>
                <input
                  type="radio"
                  name="family-method"
                  value="phone"
                  checked={method === "phone"}
                  disabled
                  onChange={() => {
                    setMethod("phone");
                    setTarget("");
                  }}
                />
                <span><b>{l("휴대전화 OTP", "Phone OTP")}</b><small>{l("휴대전화 OTP는 아직 사용할 수 없습니다.", "Phone OTP not available yet.")}</small></span>
              </label>
              <label data-selected={method === "email"}>
                <input
                  type="radio"
                  name="family-method"
                  value="email"
                  checked={method === "email"}
                  onChange={() => {
                    setMethod("email");
                    setTarget("");
                  }}
                />
                <span><b>{l("이메일 OTP", "Email OTP")}</b><small>{l("번호 입력 또는 승인 링크", "Enter a code or use an approval link")}</small></span>
              </label>
            </fieldset>

            <label className={styles.field}>
              <span>{method === "phone" ? l("학생 휴대전화번호", "Student phone number") : l("학생 이메일", "Student email")}</span>
              <input
                type={method === "phone" ? "tel" : "email"}
                inputMode={method === "phone" ? "tel" : "email"}
                autoComplete={method === "phone" ? "tel" : "email"}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder={method === "phone" ? "01012345678" : "student@example.com"}
                required
              />
              <small>{l("학생 계정에 등록된 정보와 정확히 일치해야 합니다.", "This must exactly match the student's account information.")}</small>
            </label>

            {message && <p className={styles.formMessage} role="alert">{message}</p>}
            <button className={styles.primaryButton} type="submit" disabled={busy}>
              {busy ? l("전송 중", "Sending") : l("인증 요청", "Request verification")}
            </button>
          </form>
        )}

        {phase === "verify" && (
          <form className={styles.form} onSubmit={verifyOtp}>
            <div className={styles.notice}>
              <strong>{message}</strong>
              <p>
                {method === "email"
                  ? l("학생이 이메일의 승인 링크를 눌러도 연결이 완료됩니다.", "The student can also complete the connection through the email approval link.")
                  : l("인증번호는 10분 동안 사용할 수 있습니다.", "The verification code is valid for 10 minutes.")}
              </p>
            </div>
            <label className={styles.field}>
              <span>{l("6자리 인증번호", "6-digit verification code")}</span>
              <input
                className={styles.otpInput}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={token}
                onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 8))}
                minLength={6}
                maxLength={8}
                required
              />
            </label>
            {message && message.includes("올바르지") && (
              <p className={styles.formMessage} role="alert">{message}</p>
            )}
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={restart}>
                {l("다시 입력", "Start over")}
              </button>
              <button className={styles.primaryButton} type="submit" disabled={busy || token.length < 6}>
                {busy ? l("확인 중", "Checking") : l("연결 확인", "Confirm connection")}
              </button>
            </div>
          </form>
        )}

        {phase === "success" && (
          <div className={styles.successState} role="status">
            <span aria-hidden="true">✓</span>
            <strong>{message || l("학생 계정이 연결되었습니다.", "The student account is now linked.")}</strong>
            <p>{l("일정과 수업 리포트가 보호자 포털에 반영됩니다.", "Schedules and lesson reports now appear in the family portal.")}</p>
            <button className={styles.primaryButton} type="button" onClick={restart}>
              {l("다른 학생 연결", "Link another student")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
