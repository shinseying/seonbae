"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSeonbaeLocale } from "../../utils/i18n/client";
import PortalSidebar, { type PortalSidebarItem } from "./PortalSidebar";

export type PortalHeaderUser = {
  name: string;
  email: string;
  role: "student" | "parent";
};

export default function PortalHeader({
  user,
}: {
  user: PortalHeaderUser;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useSeonbaeLocale();
  const l = (ko: string, en: string) => locale === "ko" ? ko : en;

  async function signOut() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const items: PortalSidebarItem[] = [
    {
      href: "/portal",
      label: user.role === "parent" ? l("가족 일정", "Family calendar") : l("오늘과 일정", "Overview"),
      active: pathname === "/portal" || pathname.startsWith("/portal/meeting/") || pathname.startsWith("/portal/consultation/"),
    },
    { href: "/portal/homework", label: l("숙제", "Homework"), active: pathname.startsWith("/portal/homework") },
  ];

  if (user.role === "student") {
    items.push({ href: "/portal/classroom", label: l("내 교실", "My classroom"), active: pathname.startsWith("/portal/classroom") });
  } else {
    items.push(
      { href: "/portal/classroom", label: l("내 교실", "My classroom"), active: pathname.startsWith("/portal/classroom") },
      { href: "/portal/family", label: l("학생 연결", "Students"), active: pathname.startsWith("/portal/family") },
      { href: "/portal/reports", label: l("수업 리포트", "Reports"), active: pathname.startsWith("/portal/reports") },
      { href: "/portal/billing", label: l("결제", "Billing"), active: pathname.startsWith("/portal/billing") },
    );
  }

  return (
    <PortalSidebar
      roleLabel={user.role === "parent" ? l("보호자 포털", "Family portal") : l("학생 포털", "Student portal")}
      navigationLabel={user.role === "parent" ? l("보호자 포털 메뉴", "Parent portal menu") : l("학생 포털 메뉴", "Student portal menu")}
      homeHref="/portal"
      user={{ name: user.name, email: user.email }}
      items={items}
      labels={{
        expand: l("사이드바 펼치기", "Expand sidebar"),
        collapse: l("사이드바 접기", "Collapse sidebar"),
        open: l("포털 메뉴 열기", "Open portal menu"),
        close: l("포털 메뉴 닫기", "Close portal menu"),
        website: l("홈페이지로", "Back to homepage"),
        account: l("로그인 계정", "Signed in"),
        information: l("내 정보", "My information"),
        policies: l("정책", "Policies"),
        settings: l("설정", "Settings"),
        signOut: l("로그아웃", "Log out"),
      }}
      onSignOut={signOut}
    />
  );
}
