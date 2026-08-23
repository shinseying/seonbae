"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

export type AdminSection =
  | "tutors"
  | "tutor-accounts"
  | "bookings"
  | "sessions"
  | "consultation-sessions"
  | "consultations"
  | "applications"
  | "credentials";

export default function AdminSidebar({
  active,
  adminName,
  styles,
}: {
  active: AdminSection;
  adminName: string;
  styles: Record<string, string>;
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  // One workspace per tab. Pages that used to stack two unrelated sections are
  // split so a tab is a single job.
  const links: Array<{ key: AdminSection; href: string; label: string }> = [
    { key: "tutors", href: "/admin", label: "튜터 명부" },
    { key: "tutor-accounts", href: "/admin/tutor-accounts", label: "튜터 계정 생성" },
    { key: "bookings", href: "/admin/bookings", label: "상담 예약" },
    { key: "sessions", href: "/admin/sessions", label: "Zoom 수업" },
    { key: "consultation-sessions", href: "/admin/consultation-sessions", label: "보호자 상담 일정" },
    { key: "consultations", href: "/admin/consultations", label: "상담 신청" },
    { key: "applications", href: "/admin/applications", label: "가입 심사" },
    { key: "credentials", href: "/admin/credentials", label: "자격 검증" },
  ];

  return (
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/admin">
        <img src="/logo.png" alt="" width="38" height="38" />
        <span><b>Seonbae</b><small>ADMIN PORTAL</small></span>
      </Link>
      <nav aria-label="관리자 포털 메뉴">
        <span>OPERATIONS</span>
        {links.map((link) => (
          <Link className={active === link.key ? styles.active : undefined} href={link.href} key={link.key}>
            <i aria-hidden="true" />
            {link.label}
          </Link>
        ))}
        <Link href="/#/ko/tutors"><i aria-hidden="true" />공개 명부 보기 <em aria-hidden="true">↗</em></Link>
      </nav>
      <div className={styles.adminAccount || undefined}>
        <span className={styles.adminAvatar || undefined}>{initials(adminName)}</span>
        <p><small>관리자</small><b>{adminName}</b></p>
        <button type="button" onClick={signOut}>로그아웃</button>
      </div>
    </aside>
  );
}

function initials(value: string) {
  const clean = value.trim();
  if (!clean) return "선";
  return /^[가-힣]/.test(clean)
    ? clean.slice(-2)
    : clean.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}
