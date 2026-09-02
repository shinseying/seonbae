import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { getPasswordPolicyError } from "../../../../utils/auth/password";
import { resolvePortalDestination } from "../../../../utils/auth/portal-destination";
import {
  authRateLimitResponse,
  consumeAuthRateLimit,
} from "../../../../utils/auth/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "password_update");
  if (!rateLimit.allowed) {
    return authRateLimitResponse(rateLimit.retryAfterSeconds);
  }

  let body: { password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "새 비밀번호를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const password = typeof body.password === "string" ? body.password : "";
  const passwordError = getPasswordPolicyError(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "재설정 링크가 만료되었습니다. 새 링크를 요청해 주세요." },
      { status: 401 },
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json(
      { error: "비밀번호를 변경하지 못했습니다. 새 링크를 요청해 다시 시도해 주세요." },
      { status: 400 },
    );
  }

  await supabase.auth.signOut({ scope: "others" });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    destination: await resolvePortalDestination(user.id, profile),
  });
}
