import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../../utils/supabase/server";
import { resolvePortalDestination } from "../../../../utils/auth/portal-destination";
import {
  authRateLimitResponse,
  consumeAuthRateLimit,
} from "../../../../utils/auth/rate-limit";

export const dynamic = "force-dynamic";

const adminLoginId = "ssapgoadmin";
const adminAuthEmail = "ssapgoadmin@seonbae.internal";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "authenticate");
  if (!rateLimit.allowed) {
    return authRateLimitResponse(rateLimit.retryAfterSeconds);
  }

  let body: { identifier?: unknown; password?: unknown; remember?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "로그인 정보를 다시 확인해 주세요." }, { status: 400 });
  }

  const identifier =
    typeof body.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const remember = body.remember === true;
  const isAdminLogin = identifier === adminLoginId;
  const email = isAdminLogin ? adminAuthEmail : identifier;

  if (!identifier || !password || (!isAdminLogin && !isEmail(email))) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const supabase = await createClient({ remember });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호를 다시 확인해 주세요." },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status")
    .eq("id", data.user.id)
    .single();

  if (isAdminLogin && profile?.role !== "admin") {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "관리자 권한을 확인하지 못했습니다." },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const rememberOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: 400 * 24 * 60 * 60 } : {}),
  };
  cookieStore.set("seonbae-remember", remember ? "1" : "0", rememberOptions);
  const destination = await resolvePortalDestination(data.user.id, profile);

  return NextResponse.json({
    destination,
  });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
