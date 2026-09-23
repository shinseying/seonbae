// One language choice for the whole site.
//
// Marketing and legal pages exist twice: Korean at /x and English at /en/x.
// The portal, login and account pages have one URL and switch text in place.
// Before 2026-09-24 the first group followed the URL and the second followed
// localStorage, so a visitor who chose English saw Korean at / and English in
// the portal. The seonbae-lang cookie is now the single choice: middleware
// sends a paired page to the chosen twin before it paints, and the portal
// reads the same cookie.

export type SiteLocale = "ko" | "en";

export const LOCALE_COOKIE = "seonbae-lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Keep in step with marketingRoots in marketing/src/i18n/locale.ts.
const PAIRED_ROOTS = new Set([
  "/",
  "/about",
  "/become-a-tutor",
  "/contact",
  "/get-matched",
  "/how-it-works",
  "/mock-exams",
  "/pricing",
  "/resources",
  "/subjects",
  "/tutors",
  "/verification",
  "/privacy",
  "/terms",
]);

export function parseLocale(value: string | null | undefined): SiteLocale | null {
  return value === "ko" || value === "en" ? value : null;
}

/** The language a paired page is in and its language-free path, or null. */
export function pairedPage(pathname: string): { locale: SiteLocale; plain: string } | null {
  const english = pathname === "/en" || pathname.startsWith("/en/");
  const plain = english ? pathname.slice(3) || "/" : pathname;
  const root = plain === "/" ? "/" : `/${plain.split("/")[1]}`;
  if (!PAIRED_ROOTS.has(root)) return null;
  return { locale: english ? "en" : "ko", plain };
}

export function pathInLocale(plain: string, locale: SiteLocale): string {
  if (locale === "ko") return plain;
  return plain === "/" ? "/en" : `/en${plain}`;
}

export type LocaleRoute = {
  /** Path plus query to send the visitor to instead. */
  redirectTo?: string;
  /** Language to store in the cookie on the response. */
  remember?: SiteLocale;
};

/**
 * `?lang=` is an explicit choice (the KO/EN controls add it so they work
 * without JavaScript): it is stored and stripped. Otherwise a stored choice
 * moves a paired page to its twin. With no choice yet, the URL decides and
 * nothing is stored here; the page's head script adopts it.
 */
export function routeLocale(input: {
  method: string;
  pathname: string;
  search: string;
  cookie: string | undefined;
}): LocaleRoute {
  if (input.method !== "GET" && input.method !== "HEAD") return {};
  if (input.pathname.startsWith("/api/") || input.pathname.startsWith("/_next/")) return {};

  const params = new URLSearchParams(input.search);
  const explicit = parseLocale(params.get("lang"));
  const stored = parseLocale(input.cookie);
  const page = pairedPage(input.pathname);

  if (!page) return explicit ? { remember: explicit } : {};

  const wanted = explicit ?? stored;
  if (!wanted || (!explicit && wanted === page.locale)) return {};

  params.delete("lang");
  const query = params.toString();
  return {
    redirectTo: `${pathInLocale(page.plain, wanted)}${query ? `?${query}` : ""}`,
    ...(explicit ? { remember: explicit } : {}),
  };
}
