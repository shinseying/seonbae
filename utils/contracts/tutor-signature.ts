import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient } from "../supabase/admin";
import { TUTOR_CONTRACT_VERSION } from "./tutor-contract";

// The contract is the gate on a tutor account, not a step inside admissions.
// An account can be approved, provisioned by an admin, and fully linked to a
// registry row and still be unusable until the current contract is signed.
export async function hasSignedTutorContract(userId: string) {
  const { data, error } = await createAdminClient()
    .from("tutor_contract_signatures")
    .select("id")
    .eq("tutor_id", userId)
    .eq("contract_version", TUTOR_CONTRACT_VERSION)
    .maybeSingle();
  if (error) {
    console.error("Tutor contract lookup failed", { code: error.code, message: error.message });
  }
  return Boolean(data);
}

// Called by every tutor portal page except the contract page itself.
export async function requireSignedTutorContract(userId: string) {
  if (!(await hasSignedTutorContract(userId))) {
    redirect("/portal/tutor/contract");
  }
}
