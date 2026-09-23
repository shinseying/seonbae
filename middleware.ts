import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./utils/supabase/middleware";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  routeLocale,
  type SiteLocale,
} from "./utils/i18n/locale-routing";

export async function middleware(request: NextRequest) {
  const locale = routeLocale({
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
  });

  if (locale.redirectTo) {
    const redirect = NextResponse.redirect(new URL(locale.redirectTo, request.url), 307);
    redirect.headers.set("Cache-Control", "private, no-store");
    if (locale.remember) rememberLocale(redirect, locale.remember, request);
    return redirect;
  }

  const response = await updateSession(request);
  if (locale.remember) rememberLocale(response, locale.remember, request);
  return response;
}

// Readable by page scripts on purpose: the head scripts and the login toggle
// write it too.
function rememberLocale(response: NextResponse, locale: SiteLocale, request: NextRequest) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
