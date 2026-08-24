"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../verification.module.css";

const CLOSE_SECONDS = 15;

export default function ThankYouClient({ email, reviewPending = false }: { email: string; reviewPending?: boolean }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(CLOSE_SECONDS);

  useEffect(() => {
    const interval = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    const timeout = window.setTimeout(() => router.replace("/?verified=1"), CLOSE_SECONDS * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [router]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.brand} href="/"><img src="/logo.png" alt="" width="40" height="40" /> Seonbae</Link>
        <section className={styles.card}>
          <p className={styles.eyebrow}>EMAIL VERIFIED</p>
          <h1>확인되었습니다.<br />반갑습니다.</h1>
          <p className={styles.description}>{email} 인증이 완료되었고 로그인 상태가 유지됩니다. {reviewPending ? "가입 심사는 관리자 포털에서 이어집니다." : "이제 포털을 바로 이용하실 수 있습니다."}</p>
          <div className={styles.actions}>
            <button className={styles.primary} type="button" onClick={() => router.replace("/?verified=1")}>지금 홈으로 이동</button>
          </div>
          <p className={styles.timer}><strong>{seconds}초</strong> 뒤 이 화면이 닫히고 홈으로 이동합니다.</p>
        </section>
      </div>
    </main>
  );
}
