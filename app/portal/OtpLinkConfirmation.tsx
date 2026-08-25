"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./parent.module.css";

export default function OtpLinkConfirmation({
  challenge,
  mode,
}: {
  challenge: string;
  mode: "billing" | "family";
}) {
  const router = useRouter();
  const [status, setStatus] = useState("일회용 링크를 확인하고 있습니다.");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access_token");
    if (!accessToken || !challenge) {
      setFailed(true);
      setStatus("인증 링크가 올바르지 않거나 만료되었습니다.");
      return;
    }

    let active = true;
    fetch("/api/billing-access/complete", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, challenge }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "인증을 완료하지 못했습니다.");
        if (!active) return;
        setStatus(mode === "billing" ? "결제 내역 잠금이 해제되었습니다." : "학생 계정 연결이 승인되었습니다.");
        window.history.replaceState(null, "", window.location.pathname);
        window.setTimeout(() => {
          router.replace("/portal/billing");
          router.refresh();
        }, 700);
      })
      .catch((error: Error) => {
        if (!active) return;
        setFailed(true);
        setStatus(error.message);
      });
    return () => {
      active = false;
    };
  }, [challenge, mode, router]);

  return (
    <main className={styles.confirmPage}>
      <section className={styles.confirmCard}>
        <img src="/logo.png" alt="" width="58" height="58" />
        <span>{failed ? "확인 필요" : "보안 확인"}</span>
        <h1>{status}</h1>
        <p>
          {failed
            ? "요청한 브라우저에서 새 인증번호나 승인 링크를 받아 주세요."
            : "잠시 후 보호자 포털로 이동합니다."}
        </p>
        {failed && <Link href="/portal/billing">포털로 돌아가기</Link>}
      </section>
    </main>
  );
}
