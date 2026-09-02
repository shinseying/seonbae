import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_STEP_COOKIE,
  decodeJwtClaims,
  readAccessGate,
  sessionBindingFromClaims,
} from "../../../utils/auth/access-gate";
import { setAdminEntryVerified } from "../../../utils/auth/step-up-server";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  if (!userData.user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profile?.role !== "admin") return NextResponse.redirect(new URL("/portal", request.url));

  const sessionId = sessionBindingFromClaims(
    decodeJwtClaims(sessionData.session?.access_token),
  );
  if (!sessionId) return NextResponse.redirect(new URL("/login", request.url));
  const identity = { userId: userData.user.id, sessionId };
  const cookieStore = await cookies();
  const phraseVerified = await readAccessGate(
    cookieStore.get(ADMIN_STEP_COOKIE)?.value,
    "admin-step",
    identity,
  );
  if (!phraseVerified) return NextResponse.redirect(new URL("/admin-verify", request.url));

  await setAdminEntryVerified(identity);
  return NextResponse.redirect(new URL("/admin", request.url));
}
