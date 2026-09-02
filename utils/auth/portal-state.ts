export type PortalProfileState = {
  role: string | null;
  account_status: string | null;
} | null;

// Keep every post-authentication entry point on one routing table. In
// particular, an approved tutor is not portal-ready until the current contract
// is signed.
export function portalDestinationForState(
  profile: PortalProfileState,
  hasSignedCurrentTutorContract = false,
) {
  if (profile?.role === "admin") return "/admin";

  if (profile?.role === "tutor") {
    if (profile.account_status !== "pending" && profile.account_status !== "approved") {
      return "/portal/pending";
    }
    if (!hasSignedCurrentTutorContract) return "/portal/tutor/contract";
    return profile.account_status === "approved" ? "/portal/tutor" : "/portal/pending";
  }

  return profile?.account_status === "approved" ? "/portal" : "/portal/pending";
}
