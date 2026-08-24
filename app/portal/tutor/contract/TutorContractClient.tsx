"use client";

import { useRef, useState, type FormEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { useSeonbaeLocale } from "../../../../utils/i18n/client";
import {
  TUTOR_CONTRACT_CLAUSES,
  TUTOR_CONTRACT_COMPANY,
  TUTOR_CONTRACT_INTRO,
  TUTOR_CONTRACT_TITLE,
  TUTOR_CONTRACT_VERSION,
} from "../../../../utils/contracts/tutor-contract";
import styles from "./contract.module.css";

export type SignedContractReceipt = {
  id: string;
  version: string;
  contractHash: string;
  signerName: string;
  birthDate: string;
  phone: string;
  affiliation: string;
  email: string;
  signatureSha256: string;
  signatureUrl: string | null;
  signedAt: string;
};

export default function TutorContractClient({
  contractHash,
  applicationDate,
  identity,
  receipt,
}: {
  contractHash: string;
  applicationDate: string;
  identity: { name: string; email: string; phone: string; applicationId: number };
  receipt: SignedContractReceipt | null;
}) {
  const router = useRouter();
  const locale = useSeonbaeLocale();
  const l = (ko: string, en: string) => locale === "ko" ? ko : en;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [signerName, setSignerName] = useState(identity.name);
  const [birthDate, setBirthDate] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.beginPath();
    context.moveTo(next.x, next.y);
    context.lineWidth = Math.max(3, canvas.width / 180);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#173b52";
    drawingRef.current = true;
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
    hasInkRef.current = true;
  }

  function stopDrawing(event: PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasInkRef.current || !canvasRef.current) {
      setMessage(l("서명란에 직접 서명해 주세요.", "Draw your signature in the signature box."));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tutor-contract", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          contractHash,
          signerName,
          birthDate,
          affiliation,
          accepted,
          signatureDataUrl: canvasRef.current.toDataURL("image/png"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || l("계약을 저장하지 못했습니다.", "The contract could not be saved."));
      router.replace(result.destination || "/portal/tutor");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : l("네트워크 연결을 확인해 주세요.", "Check your network connection."));
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p>PENDING TUTOR · CONTRACT</p>
          <h1>{receipt ? l("계약이 체결되었습니다.", "Your contract is signed.") : l("튜터 계약을 확인하고 서명해 주세요.", "Review and sign your tutor contract.")}</h1>
          <span>{l("계정 심사 대기", "Account review pending")} · {formatDate(applicationDate, locale)}</span>
        </div>
        <aside>
          <span>{l("계약 버전", "Contract version")}</span><b>{TUTOR_CONTRACT_VERSION}</b>
          <span>{l("신청 번호", "Application ID")}</span><b>#{identity.applicationId}</b>
        </aside>
      </header>

      <section className={styles.document} aria-label={TUTOR_CONTRACT_TITLE}>
        <div className={styles.documentHeading}>
          <p>SEONBAE · ELECTRONIC CONTRACT</p>
          <h2>{TUTOR_CONTRACT_TITLE}</h2>
          <span>{TUTOR_CONTRACT_INTRO}</span>
        </div>
        <div className={styles.clauses}>
          {TUTOR_CONTRACT_CLAUSES.map((clause) => (
            <article key={clause.title}>
              <h3>{clause.title}</h3>
              {clause.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </article>
          ))}
        </div>

        <div className={styles.companyBlock}>
          <div><span>{l("회사", "Company")}</span><b>{TUTOR_CONTRACT_COMPANY.legalName}</b></div>
          <div><span>{l("대표이사", "Representative")}</span><b>{TUTOR_CONTRACT_COMPANY.representative}</b></div>
          <div><span>{l("주소", "Address")}</span><b>{TUTOR_CONTRACT_COMPANY.address}</b></div>
        </div>

        {receipt ? (
          <section className={styles.receipt}>
            <div className={styles.receiptHeading}>
              <div><p>SIGNED & RECORDED</p><h2>{l("전자서명 완료", "Electronic signature complete")}</h2></div>
              <button type="button" onClick={() => window.print()}>{l("계약서 인쇄·저장", "Print or save")}</button>
            </div>
            <dl>
              <div><dt>{l("서명자", "Signer")}</dt><dd>{receipt.signerName}</dd></div>
              <div><dt>{l("체결 시각", "Signed at")}</dt><dd>{formatDateTime(receipt.signedAt, locale)}</dd></div>
              <div><dt>{l("생년월일", "Date of birth")}</dt><dd>{receipt.birthDate}</dd></div>
              <div><dt>{l("소속·학과", "Affiliation")}</dt><dd>{receipt.affiliation}</dd></div>
              <div><dt>{l("이메일", "Email")}</dt><dd>{receipt.email}</dd></div>
              <div><dt>{l("계약 기록 번호", "Record ID")}</dt><dd className={styles.mono}>{receipt.id}</dd></div>
            </dl>
            {receipt.signatureUrl && <img className={styles.signatureImage} src={receipt.signatureUrl} alt={l(`${receipt.signerName}님의 전자서명`, `Electronic signature of ${receipt.signerName}`)} />}
            <p className={styles.hash}>SHA-256 · {receipt.contractHash}<br />SIGNATURE · {receipt.signatureSha256}</p>
          </section>
        ) : (
          <form className={styles.signing} onSubmit={submit}>
            <div className={styles.signingHeading}>
              <p>SIGNATURE</p>
              <h2>{l("본인 정보를 확인해 주세요.", "Confirm your identity.")}</h2>
              <span>{l("이 서명은 승인 대기 중인 신청과 계약서 원문에 함께 연결됩니다.", "This signature is linked to your pending application and this exact contract version.")}</span>
            </div>
            <div className={styles.formGrid}>
              <label><span>{l("성명", "Legal name")}</span><input value={signerName} onChange={(event) => setSignerName(event.target.value)} minLength={2} maxLength={80} autoComplete="name" required /></label>
              <label className={styles.dateField}>
                <span>{l("생년월일", "Date of birth")}</span>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(event) => setBirthDate(event.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  min="1940-01-01"
                  data-empty={birthDate ? undefined : "true"}
                  // Chrome only opens the calendar from its small icon, so the
                  // whole field acts as the trigger.
                  onClick={(event) => {
                    const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
                    try {
                      input.showPicker?.();
                    } catch {
                      // Safari and Firefox open on focus; nothing to do here.
                    }
                  }}
                  required
                />
              </label>
              <label><span>{l("소속·학과", "University and department")}</span><input value={affiliation} onChange={(event) => setAffiliation(event.target.value)} minLength={2} maxLength={120} placeholder={l("예: 서울대학교 경제학부", "e.g. Seoul National University, Economics")} required /></label>
              <label><span>{l("연락처", "Phone")}</span><input value={identity.phone} readOnly /></label>
              <label className={styles.fullField}><span>{l("이메일", "Email")}</span><input value={identity.email} readOnly /></label>
            </div>
            <div className={styles.canvasField}>
              <div><span>{l("직접 서명", "Draw your signature")}</span><button type="button" onClick={clearSignature}>{l("지우기", "Clear")}</button></div>
              <canvas ref={canvasRef} width={900} height={240} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} aria-label={l("전자서명 입력란", "Electronic signature pad")} />
            </div>
            <label className={styles.acceptance}>
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required />
              <span>{l("계약서 전체를 읽고 이해했으며, 전자서명이 자필 서명과 같은 의사표시로 사용되는 것에 동의합니다.", "I have read and understood the full contract and agree that this electronic signature records my intent to sign.")}</span>
            </label>
            <p className={styles.auditNote}>{l("보안을 위해 계약 버전, 원문 해시, 서명 해시, 승인 기록, 서명 시각 및 가명처리된 접속 기록이 보관됩니다.", "For security, we retain the contract version and hash, signature hash, approval record, signing time, and pseudonymized connection audit data.")}</p>
            {message && <p className={styles.message} role="alert">{message}</p>}
            <button className={styles.submit} type="submit" disabled={busy || !accepted}>{busy ? l("안전하게 저장 중…", "Saving securely…") : l("동의하고 전자서명하기", "Agree and sign electronically")}</button>
          </form>
        )}

        <footer className={styles.documentFooter}>
          <p>{l("계약 원문 SHA-256", "Contract SHA-256")} · <span>{contractHash}</span></p>
          <p>{l("계약서 원문은 서명 시점 그대로 감사 기록에 저장됩니다.", "The exact contract text is stored in the audit record at signing.")}</p>
        </footer>
      </section>
    </main>
  );
}

function formatDate(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-GB", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}
