"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../parent.module.css";
import { usePortalText } from "../PortalLocale";

export type BillingLineItem = {
  id: number;
  date: string;
  title: string;
  subject: string;
  studentName: string;
  tutorName: string;
  minutes: number;
  amountKrw: number | null;
  status: "confirmed" | "scheduled";
};

type Method = "email" | "phone";

export default function BillingClient({
  locked,
  accessExpiresAt,
  methods,
  items,
}: {
  locked: boolean;
  accessExpiresAt: number | null;
  methods: { email: boolean; phone: boolean };
  items: BillingLineItem[];
}) {
  if (locked) return <BillingGate methods={methods} />;
  return <BillingLedger accessExpiresAt={accessExpiresAt} items={items} />;
}

function BillingGate({ methods }: { methods: { email: boolean; phone: boolean } }) {
  const router = useRouter();
  const { text: l } = usePortalText();
  const initialMethod: Method = methods.phone ? "phone" : "email";
  const [method, setMethod] = useState<Method>(initialMethod);
  const [challenge, setChallenge] = useState("");
  const [token, setToken] = useState("");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestOtp() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing-access/request", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || l("인증 요청을 보내지 못했습니다.", "The verification request could not be sent."));
        return;
      }
      setChallenge(result.challenge);
      setDestination(result.destination);
      setMessage(result.message);
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
      const response = await fetch("/api/billing-access/verify", {
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
      router.refresh();
    } catch {
      setMessage(l("네트워크 연결을 확인한 뒤 다시 시도해 주세요.", "Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.panel} ${styles.billingGate}`}>
      <div className={styles.lockMark} aria-hidden="true"><span /></div>
      <div className={styles.gateCopy}>
        <span>{l("민감 정보 보호", "Protected information")}</span>
        <h2>{l("결제 내역이 잠겨 있습니다.", "Billing details are locked.")}</h2>
        <p>{l("등록된 연락처로 본인 확인을 완료하면 12시간 동안 이 기기에서 결제 내역을 확인할 수 있습니다.", "Verify through your registered contact method to view billing details on this device for 12 hours.")}</p>
      </div>

      <div className={styles.gateForm}>
        <fieldset className={styles.methodChoice}>
          <legend>{l("인증 방법", "Verification method")}</legend>
          <label data-selected={method === "phone"} data-disabled={!methods.phone}>
            <input
              type="radio"
              name="billing-method"
              value="phone"
              checked={method === "phone"}
              disabled={!methods.phone}
              onChange={() => {
                setMethod("phone");
                setChallenge("");
              }}
            />
            <span><b>{l("휴대전화", "Phone")}</b><small>{l("휴대전화 OTP는 아직 사용할 수 없습니다.", "Phone OTP not available yet.")}</small></span>
          </label>
          <label data-selected={method === "email"} data-disabled={!methods.email}>
            <input
              type="radio"
              name="billing-method"
              value="email"
              checked={method === "email"}
              disabled={!methods.email}
              onChange={() => {
                setMethod("email");
                setChallenge("");
              }}
            />
            <span><b>{l("이메일", "Email")}</b><small>{l("OTP 또는 링크", "OTP or approval link")}</small></span>
          </label>
        </fieldset>

        {!challenge ? (
          <button className={styles.primaryButton} type="button" onClick={requestOtp} disabled={busy}>
            {busy ? l("전송 중", "Sending") : l("인증번호 받기", "Get verification code")}
          </button>
        ) : (
          <form className={styles.form} onSubmit={verifyOtp}>
            <div className={styles.notice}>
              <strong>{destination}</strong>
              <p>{message}</p>
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
            <button className={styles.primaryButton} type="submit" disabled={busy || token.length < 6}>
              {busy ? l("확인 중", "Checking") : l("잠금 해제", "Unlock billing")}
            </button>
          </form>
        )}
        {message && !challenge && <p className={styles.formMessage} role="alert">{message}</p>}
      </div>
    </section>
  );
}

function BillingLedger({
  accessExpiresAt,
  items,
}: {
  accessExpiresAt: number | null;
  items: BillingLineItem[];
}) {
  const { locale, text: l } = usePortalText();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const months = useMemo(() => {
    const values = new Set(items.map((item) => item.date.slice(0, 7)));
    values.add(currentMonth);
    return Array.from(values).sort().reverse();
  }, [items, currentMonth]);
  const [month, setMonth] = useState(months[0]);
  const [paymentNotice, setPaymentNotice] = useState(false);
  const monthItems = items.filter((item) => item.date.startsWith(month));
  const totalMinutes = monthItems.reduce((sum, item) => sum + item.minutes, 0);
  const pricedItems = monthItems.filter((item) => item.amountKrw !== null);
  const totalAmount = pricedItems.reduce((sum, item) => sum + (item.amountKrw || 0), 0);
  const allPriced = monthItems.length > 0 && pricedItems.length === monthItems.length;

  return (
    <>
      <section className={styles.securityStrip}>
        <div>
          <strong>{l("본인 확인 완료", "Identity verified")}</strong>
          <span>
            {accessExpiresAt
              ? l(`${formatSeoulTime(accessExpiresAt)}까지 열림`, `Open until ${formatSeoulTime(accessExpiresAt)} KST`)
              : l("보안 세션 활성화", "Secure session active")}
          </span>
        </div>
        <p>{l("기기 또는 로그인 지역이 크게 바뀌면 다시 인증합니다.", "A major device or sign-in location change will require verification again.")}</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.billingHeader}>
          <div className={styles.sectionHeading}>
            <span>{l("월별 명세", "Monthly statement")}</span>
            <h2>{l(`${formatMonth(month, "ko")} 수업료`, `${formatMonth(month, "en")} lessons`)}</h2>
          </div>
          <label className={styles.monthSelect}>
            <span>{l("결제 월", "Billing month")}</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {months.map((value) => <option key={value} value={value}>{formatMonth(value, locale)}</option>)}
            </select>
          </label>
        </div>

        {monthItems.length ? (
          <div className={styles.invoiceTable} role="table" aria-label={l(`${formatMonth(month, "ko")} 수업료 내역`, `${formatMonth(month, "en")} billing details`)}>
            <div className={styles.invoiceHead} role="row">
              <span role="columnheader">{l("수업일", "Date")}</span>
              <span role="columnheader">{l("학생 / 튜터", "Student / Tutor")}</span>
              <span role="columnheader">{l("수업", "Lesson")}</span>
              <span role="columnheader">{l("시간", "Time")}</span>
              <span role="columnheader">{l("금액", "Amount")}</span>
            </div>
            {monthItems.map((item) => (
              <article className={styles.invoiceRow} role="row" key={item.id}>
                <time role="cell">{formatDate(item.date, locale)}</time>
                <div role="cell"><strong>{item.studentName}</strong><span>{item.tutorName}{l(" 튜터", ", tutor")}</span></div>
                <div role="cell"><strong>{item.title}</strong><span>{item.subject}</span></div>
                <strong role="cell">{formatMinutes(item.minutes, locale)}</strong>
                <strong role="cell">{item.amountKrw === null ? l("확정 전", "Pending") : formatKrw(item.amountKrw, locale)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>{l("이 달에 청구할 수업이 없습니다.", "There are no billable lessons this month.")}</strong>
            <p>{l("수업 일정이 등록되면 학생, 튜터, 수업 시간과 금액이 이곳에 표시됩니다.", "Students, tutors, lesson time, and charges appear here once lessons are scheduled.")}</p>
          </div>
        )}

        <div className={styles.invoiceSummary}>
          <dl>
            <div><dt>{l("수업 수", "Lessons")}</dt><dd>{l(`${monthItems.length}회`, `${monthItems.length}`)}</dd></div>
            <div><dt>{l("총 수업 시간", "Total lesson time")}</dt><dd>{formatMinutes(totalMinutes, locale)}</dd></div>
            <div className={styles.grandTotal}><dt>{l("결제 예정 금액", "Amount due")}</dt><dd>{allPriced ? formatKrw(totalAmount, locale) : l("금액 확정 전", "Amount pending")}</dd></div>
          </dl>
          <div className={styles.paymentAction}>
            <button
              className={styles.payButton}
              type="button"
              disabled={!monthItems.length || !allPriced}
              onClick={() => setPaymentNotice(true)}
            >
              {l("결제하기", "Pay now")}
            </button>
            <small>{l("결제 게이트웨이 연결 후 사용할 수 있습니다.", "Available after the payment gateway is connected.")}</small>
          </div>
        </div>

        {paymentNotice && (
          <p className={styles.formMessage} role="status">
            {l("결제 게이트웨이는 다음 단계에서 연결됩니다.", "The payment gateway will be connected in the next phase.")}
          </p>
        )}
      </section>
    </>
  );
}

function formatMonth(value: string, locale: "ko" | "en") {
  const [year, month] = value.split("-");
  return locale === "ko" ? `${year}년 ${Number(month)}월` : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(new Date(Number(year), Number(month) - 1, 1));
}

function formatDate(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric", weekday: "short" })
    .format(new Date(`${value}T00:00:00`));
}

function formatMinutes(value: number, locale: "ko" | "en") {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (locale === "en") return hours ? `${hours}h${minutes ? ` ${minutes}m` : ""}` : `${minutes}m`;
  if (!hours) return `${minutes}분`;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

function formatKrw(value: number, locale: "ko" | "en") {
  return locale === "ko" ? `${new Intl.NumberFormat("ko-KR").format(value)}원` : `KRW ${new Intl.NumberFormat("en-US").format(value)}`;
}

function formatSeoulTime(epochSeconds: number) {
  const date = new Date(epochSeconds * 1000);
  const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + 9 * 60;
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
