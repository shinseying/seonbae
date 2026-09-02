import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import {
  ADMIN_AUTH_EMAIL,
  ADMIN_ENTRY_COOKIE,
  ADMIN_STEP_COOKIE,
  claimsIdentity,
  readAccessGate,
  USER_VERIFIED_COOKIE,
} from "../auth/access-gate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({ request });
  const remember = request.cookies.get("seonbae-remember")?.value !== "0";

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );

        supabaseResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          const cookieOptions = { ...options };
          if (!remember && cookieOptions.maxAge !== 0) {
            delete cookieOptions.maxAge;
            delete cookieOptions.expires;
          }
          supabaseResponse.cookies.set(name, value, cookieOptions);
        });
      },
    },
  });

  // Do not remove this call: it refreshes expired auth tokens when needed.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = (claimsData?.claims ?? null) as Record<string, unknown> | null;
  const identity = claimsIdentity(claims);
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");
  const adminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const adminApi = pathname.startsWith("/api/admin/");
  const protectedPage =
    pathname === "/portal"
    || pathname.startsWith("/portal/")
    || pathname === "/my-page"
    || pathname.startsWith("/my-page/")
    || pathname === "/admin-verify"
    || pathname === "/admin-shell"
    || adminPath;

  if (!identity.userId || !identity.sessionId) {
    if (adminApi) return preserveCookies(jsonError("로그인이 필요합니다.", 401), supabaseResponse);
    if (protectedPage) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "";
      return preserveCookies(NextResponse.redirect(login), supabaseResponse);
    }
    return supabaseResponse;
  }

  let isAdmin = identity.email === ADMIN_AUTH_EMAIL;
  if (adminPath || adminApi || pathname === "/admin-verify" || pathname === "/admin-shell") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", identity.userId)
      .single();
    isAdmin = profile?.role === "admin";
  }

  if (adminPath || adminApi || pathname === "/admin-verify" || pathname === "/admin-shell") {
    if (!isAdmin) {
      if (isApi) return preserveCookies(jsonError("관리자 권한이 필요합니다.", 403), supabaseResponse);
      const portal = request.nextUrl.clone();
      portal.pathname = "/portal";
      portal.search = "";
      return preserveCookies(NextResponse.redirect(portal), supabaseResponse);
    }

    if (pathname === "/admin-verify") return supabaseResponse;
    const phraseVerified = await readAccessGate(
      request.cookies.get(ADMIN_STEP_COOKIE)?.value,
      "admin-step",
      identity,
    );
    if (!phraseVerified) {
      if (isApi) return preserveCookies(jsonError("관리자 추가 확인이 필요합니다.", 403, "/admin-verify"), supabaseResponse);
      const verify = request.nextUrl.clone();
      verify.pathname = "/admin-verify";
      verify.search = "";
      return preserveCookies(NextResponse.redirect(verify), supabaseResponse);
    }

    if (pathname === "/admin-shell" || pathname === "/admin/entry") {
      return supabaseResponse;
    }

    const entryVerified = await readAccessGate(
      request.cookies.get(ADMIN_ENTRY_COOKIE)?.value,
      "admin-entry",
      identity,
    );
    if (!entryVerified) {
      if (isApi) return preserveCookies(jsonError("관리자 진입 확인이 필요합니다.", 403, "/admin-shell"), supabaseResponse);
      const shell = request.nextUrl.clone();
      shell.pathname = "/admin-shell";
      shell.search = "";
      return preserveCookies(NextResponse.redirect(shell), supabaseResponse);
    }
    return supabaseResponse;
  }

  if (pathname === "/login/verify") return supabaseResponse;

  const protectedApi = isApi && !isPublicApi(pathname);
  if ((protectedPage || protectedApi) && !isAdmin) {
    const verified = await readAccessGate(
      request.cookies.get(USER_VERIFIED_COOKIE)?.value,
      "user-verified",
      identity,
    );
    if (!verified) {
      if (isApi) {
        return preserveCookies(
          jsonError("2단계 인증이 필요합니다.", 403, "/login/verify"),
          supabaseResponse,
        );
      }
      const verify = request.nextUrl.clone();
      verify.pathname = "/login/verify";
      verify.search = "";
      return preserveCookies(NextResponse.redirect(verify), supabaseResponse);
    }
  }

  return supabaseResponse;
};

function isPublicApi(pathname: string) {
  return pathname.startsWith("/api/auth/")
    || pathname === "/api/tutors"
    || pathname === "/api/tutor-applications"
    || pathname === "/api/consultations"
    || pathname === "/api/zoom/webhook";
}

function jsonError(message: string, status: number, destination?: string) {
  return NextResponse.json(
    { error: message, ...(destination ? { destination } : {}) },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

function preserveCookies(response: NextResponse, source: NextResponse) {
  for (const cookie of source.cookies.getAll()) response.cookies.set(cookie);
  return response;
}
