"use client";

import { useSyncExternalStore } from "react";

export type SeonbaeLocale = "ko" | "en";

const STORAGE_KEY = "seonbae-lang";
const CHANGE_EVENT = "seonbae:language-change";

// The cookie is the site-wide choice (utils/i18n/locale-routing.ts); the
// localStorage copy covers browsers that block cookies.
function readLocale(): SeonbaeLocale {
  if (typeof window === "undefined") return "ko";
  const cookie = document.cookie.match(/(?:^|; )seonbae-lang=(ko|en)(?:;|$)/)?.[1];
  if (cookie === "en" || cookie === "ko") return cookie;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ko";
  } catch {
    return "ko";
  }
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useSeonbaeLocale() {
  return useSyncExternalStore(subscribe, readLocale, () => "ko" as const);
}

export function setSeonbaeLocale(locale: SeonbaeLocale) {
  document.cookie = `${STORAGE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The active page still changes language when browser storage is blocked.
  }
  document.documentElement.lang = locale;
  document.documentElement.dataset.lang = locale;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
