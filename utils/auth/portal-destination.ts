import { hasSignedTutorContract } from "../contracts/tutor-signature";
import { portalDestinationForState } from "./portal-state";

export type PortalProfile = {
  role: string | null;
  account_status: string | null;
};

export async function resolvePortalDestination(
  userId: string,
  profile: PortalProfile | null,
) {
  let hasSignedCurrentTutorContract = false;
  if (
    profile?.role === "tutor"
    && (profile.account_status === "pending" || profile.account_status === "approved")
  ) {
    hasSignedCurrentTutorContract = await hasSignedTutorContract(userId);
  }

  return portalDestinationForState(profile, hasSignedCurrentTutorContract);
}
