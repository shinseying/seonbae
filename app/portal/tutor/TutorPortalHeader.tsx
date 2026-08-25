"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSeonbaeLocale } from "../../../utils/i18n/client";
import PortalSidebar, { type PortalSidebarItem } from "../PortalSidebar";

export type TutorHeaderUser = {
  name: string;
  email: string;
  registryId: string;
};

export default function TutorPortalHeader({
  tutor,
}: {
  tutor: TutorHeaderUser;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useSeonbaeLocale();
  const l = (ko: string, en: string) => locale === "ko" ? ko : en;

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const items: PortalSidebarItem[] = [
    { href: "/portal/tutor", label: l("개요", "Overview"), active: pathname === "/portal/tutor" },
    { href: "/portal/tutor/homework", label: l("숙제", "Homework"), active: pathname.startsWith("/portal/tutor/homework") },
    { href: "/portal/tutor/sessions", label: l("Zoom 수업", "Zoom lessons"), active: pathname.startsWith("/portal/tutor/sessions") },
    { href: "/portal/classroom", label: l("내 교실", "My classroom"), active: pathname.startsWith("/portal/classroom") },
    { href: "/portal/tutor/profile", label: l("내 카드", "My card"), active: pathname.startsWith("/portal/tutor/profile") },
  ];

  return (
    <PortalSidebar
      roleLabel={l("튜터 포털", "Tutor portal")}
      navigationLabel={l("튜터 포털 메뉴", "Tutor portal menu")}
      homeHref="/portal/tutor"
      user={{ name: tutor.name, email: tutor.email, detail: tutor.registryId }}
      items={items}
      labels={{
        expand: l("사이드바 펼치기", "Expand sidebar"),
        collapse: l("사이드바 접기", "Collapse sidebar"),
        open: l("포털 메뉴 열기", "Open portal menu"),
        close: l("포털 메뉴 닫기", "Close portal menu"),
        website: l("홈페이지로", "Back to homepage"),
        account: l("튜터 계정", "Tutor account"),
        information: l("내 정보", "My information"),
        policies: l("정책", "Policies"),
        settings: l("설정", "Settings"),
        signOut: l("로그아웃", "Log out"),
      }}
      onSignOut={signOut}
    />
  );
}
