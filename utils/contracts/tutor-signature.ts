import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { TUTOR_CONTRACT_VERSION } from "./tutor-contract";

// The contract is the gate on a tutor account, not a step inside admissions.
// An account can be approved, provisioned by an admin, and fully linked to a
// registry row and still be unusable until the current contract is signed.
export async function hasSignedTutorContract(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tutor_contract_signatures")
    .select("id")
    .eq("tutor_id", userId)
    .eq("contract_version", TUTOR_CONTRACT_VERSION)
    .maybeSingle();
  return Boolean(data);
}

// Called by every tutor portal page except the contract page itself.
export async function requireSignedTutorContract(userId: string) {
  if (!(await hasSignedTutorContract(userId))) {
    redirect("/portal/tutor/contract");
  }
}
