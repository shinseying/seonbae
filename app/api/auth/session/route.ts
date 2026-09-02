import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { resolvePortalDestination } from "../../../../utils/auth/portal-destination";
import { cookies } from "next/headers";
import {
  ADMIN_ENTRY_COOKIE,
  ADMIN_STEP_COOKIE,
  decodeJwtClaims,
  readAccessGate,
  sessionBindingFromClaims,
  USER_VERIFIED_COOKIE,
} from "../../../../utils/auth/access-gate";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { authenticated: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,account_status")
    .eq("id", user.id)
    .single();

  const role =
    profile?.role === "admin"
      ? "admin"
      : profile?.role === "tutor"
        ? "tutor"
        : profile?.role === "parent"
          ? "parent"
          : "student";
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";
  const displayName =
    profile?.full_name?.trim() ||
    metadataName ||
    (role === "admin"
      ? "ssapgoadmin"
      : profile?.email || user.email || "사용자");
  const { data: { session } } = await supabase.auth.getSession();
  const sessionId = sessionBindingFromClaims(decodeJwtClaims(session?.access_token));
  const cookieStore = await cookies();
  let destination: string;

  if (!sessionId) {
    destination = "/login";
  } else if (role === "admin") {
    const identity = { userId: user.id, sessionId };
    const phraseVerified = await readAccessGate(
      cookieStore.get(ADMIN_STEP_COOKIE)?.value,
      "admin-step",
      identity,
    );
    const entryVerified = phraseVerified
      ? await readAccessGate(
          cookieStore.get(ADMIN_ENTRY_COOKIE)?.value,
          "admin-entry",
          identity,
        )
      : null;
    destination = !phraseVerified
      ? "/admin-verify"
      : entryVerified
        ? "/admin"
        : "/admin-shell";
  } else {
    const verified = await readAccessGate(
      cookieStore.get(USER_VERIFIED_COOKIE)?.value,
      "user-verified",
      { userId: user.id, sessionId },
    );
    destination = verified
      ? await resolvePortalDestination(user.id, profile)
      : "/login/verify";
  }

  return NextResponse.json(
    {
      authenticated: true,
      role,
      displayName,
      email: profile?.email || user.email || null,
      destination,
      secondStepRequired:
        destination === "/login/verify" || destination === "/admin-verify",
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
      },
    },
  );
}
