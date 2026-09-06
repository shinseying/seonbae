import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { legalMetadata } from "./legal/metadata";
import styles from "./not-found.module.css";

async function isEnglishRequest() {
  const pathname = (await headers()).get("x-seonbae-pathname") || "/";
  return pathname === "/en" || pathname.startsWith("/en/");
}

export async function generateMetadata(): Promise<Metadata> {
  const english = await isEnglishRequest();
  return legalMetadata({
    title: english ? "Page not found | Seonbae" : "페이지를 찾을 수 없습니다 | 선배",
    description: english
      ? "The requested page could not be found."
      : "요청하신 페이지를 찾을 수 없습니다.",
    canonical: english ? "/en/404" : "/404",
    koPath: "/404",
    enPath: "/en/404",
    locale: english ? "en" : "ko",
  });
}

export default async function NotFound() {
  const english = await isEnglishRequest();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href={english ? "/en/" : "/"} className={styles.brand}>
          <img src="/logo.png" alt="" width="58" height="45" />
          <strong>Seonbae</strong>
        </Link>
      </header>
      <section className={styles.content}>
        <div className={styles.art} aria-hidden="true"><span>4</span><i>0</i><span>4</span></div>
        <p className={styles.eyebrow}>PAGE NOT FOUND</p>
        <h1>{english ? "Looks like this lesson wandered off." : "찾으시는 페이지가 길을 잃었나 봐요."}</h1>
        <p>{english
          ? "The page may have moved, or the address may contain a typo."
          : "페이지가 이동했거나 주소가 잘못 입력되었을 수 있습니다."}</p>
        <div className={styles.actions}>
          <Link href={english ? "/en/" : "/"}>{english ? "Back to home" : "홈으로"}</Link>
          <Link href={english ? "/en/get-matched" : "/get-matched"} className={styles.primary}>{english ? "Find a tutor" : "선배 찾기"}<b aria-hidden="true">↗</b></Link>
        </div>
      </section>
    </main>
  );
}
