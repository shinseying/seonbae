import type { ReactNode } from "react";
import { createClient } from "../../utils/supabase/server";
import { hasSignedTutorContract } from "../../utils/contracts/tutor-signature";
import { createAdminClient } from "../../utils/supabase/admin";
import PortalHeader from "./PortalHeader";
import TutorPortalHeader from "./tutor/TutorPortalHeader";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return children;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,tutor_registry_id,account_status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role === "admin" || profile.account_status !== "approved") {
    return children;
  }

  // Until the contract is signed every tutor route bounces back to it, so the
  // nav would only offer dead ends.
  if (profile.role === "tutor" && !(await hasSignedTutorContract(user.id))) {
    return children;
  }

  const name =
    profile.full_name
    || user.user_metadata?.full_name
    || user.email?.split("@")[0]
    || "Seonbae";
  const email = profile.email || user.email || "";
  const tutorRosterNumber = profile.role === "tutor" && profile.tutor_registry_id
    ? (await createAdminClient()
        .from("tutors")
        .select("roster_number")
        .eq("registry_id", profile.tutor_registry_id)
        .maybeSingle()).data?.roster_number
    : null;

  return (
    <>
      {profile.role === "tutor" ? (
        <TutorPortalHeader
          tutor={{
            name,
            email,
            rosterNumber: tutorRosterNumber || null,
          }}
        />
      ) : (
        <PortalHeader
          user={{
            name,
            email,
            role: profile.role === "parent" ? "parent" : "student",
          }}
        />
      )}
      {children}
    </>
  );
}
