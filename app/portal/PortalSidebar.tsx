"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  List,
  SidebarSimple,
  X,
} from "@phosphor-icons/react";
import styles from "./portal.module.css";

export type PortalSidebarItem = {
  href: string;
  label: string;
  active?: boolean;
};

export default function PortalSidebar({
  roleLabel,
  navigationLabel,
  homeHref,
  user,
  items,
  labels,
  onSignOut,
}: {
  roleLabel: string;
  navigationLabel: string;
  homeHref: string;
  user: { name: string; email: string; detail?: string };
  items: PortalSidebarItem[];
  labels: {
    expand: string;
    collapse: string;
    open: string;
    close: string;
    website: string;
    account: string;
    information: string;
    policies: string;
    settings: string;
    signOut: string;
  };
  onSignOut: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = mobileOpen ? "hidden" : previousOverflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    document.documentElement.classList.toggle("portal-shell-collapsed", !expanded);
    return () => document.documentElement.classList.remove("portal-shell-collapsed");
  }, [expanded]);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    const timeout = window.setTimeout(() => setPendingHref(null), 10000);
    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  const closeMobile = () => setMobileOpen(false);

  function matchesPendingPath(itemHref: string) {
    if (!pendingHref) return false;
    if (itemHref === "/portal") return pendingHref === "/portal";
    if (itemHref === "/portal/tutor") return pendingHref === "/portal/tutor";
    return pendingHref === itemHref || pendingHref.startsWith(`${itemHref}/`);
  }

  function startNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    closeMobile();
    if (
      href === pathname
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;
    setPendingHref(href);
  }

  return (
    <>
      <header className={styles.mobilePortalBar}>
        <Link href={homeHref} className={styles.mobileBrand}>
          <span className={styles.mobileLogoBox}><img src="/logo.png" alt="" width="32" height="32" /></span>
          <span><b>Seonbae</b><small>{roleLabel}</small></span>
        </Link>
        <button
          type="button"
          className={styles.mobileMenuButton}
          aria-label={mobileOpen ? labels.close : labels.open}
          aria-expanded={mobileOpen}
          aria-controls="portal-sidebar"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={22} weight="bold" aria-hidden /> : <List size={24} weight="bold" aria-hidden />}
        </button>
      </header>

      <button
        type="button"
        className={styles.sidebarScrim}
        data-open={mobileOpen}
        aria-label={labels.close}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={closeMobile}
      />

      <aside
        id="portal-sidebar"
        className={styles.portalSidebar}
        data-expanded={expanded}
        data-mobile-open={mobileOpen}
        aria-busy={Boolean(pendingHref)}
      >
        <div className={styles.sidebarHeader}>
          <Link href={homeHref} className={styles.sidebarBrand} onClick={closeMobile}>
            <span className={styles.sidebarLogoBox}><img src="/logo.png" alt="" width="40" height="40" /></span>
            <span><b>Seonbae</b><small>{roleLabel}</small></span>
          </Link>
          <button
            type="button"
            className={styles.sidebarFold}
            aria-label={expanded ? labels.collapse : labels.expand}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            <SidebarSimple size={21} weight="bold" aria-hidden />
          </button>
        </div>

        <nav className={styles.sidebarNav} aria-label={navigationLabel}>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={(pendingHref ? matchesPendingPath(item.href) : item.active) ? "page" : undefined}
              data-pending={matchesPendingPath(item.href) || undefined}
              title={expanded ? undefined : item.label}
              onClick={(event) => startNavigation(event, item.href)}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link href="/" className={styles.sidebarUtility} aria-label={labels.website} title={expanded ? undefined : labels.website} onClick={closeMobile}>
            <span>{labels.website}</span>
            <ArrowUpRight size={18} weight="bold" aria-hidden />
          </Link>

          <div className={styles.sidebarAccount}>
            <span className={styles.sidebarAvatar}>{initials(user.name)}</span>
            <span className={styles.sidebarIdentity}>
              <small>{user.detail || labels.account}</small>
              <b>{user.name}</b>
              <em>{user.email}</em>
            </span>
          </div>

          <div className={styles.sidebarAccountLinks}>
            <Link href="/my-page#info" aria-label={labels.information} title={expanded ? undefined : labels.information} onClick={closeMobile}>
              <span>{labels.information}</span>
            </Link>
            <Link href="/my-page#policies" aria-label={labels.policies} title={expanded ? undefined : labels.policies} onClick={closeMobile}>
              <span>{labels.policies}</span>
            </Link>
            <Link href="/my-page#settings" aria-label={labels.settings} title={expanded ? undefined : labels.settings} onClick={closeMobile}>
              <span>{labels.settings}</span>
            </Link>
            <button type="button" aria-label={labels.signOut} title={expanded ? undefined : labels.signOut} onClick={onSignOut}>
              <span>{labels.signOut}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function initials(value: string) {
  const clean = value.trim();
  if (!clean) return "선";
  if (/^[가-힣]/.test(clean)) return clean.slice(-2);
  return clean.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
}
