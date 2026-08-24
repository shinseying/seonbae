import { redirect } from "next/navigation";
import { getTutorContractHash } from "../../../../utils/contracts/hash";
import { TUTOR_CONTRACT_VERSION } from "../../../../utils/contracts/tutor-contract";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import TutorContractClient, { type SignedContractReceipt } from "./TutorContractClient";

export const dynamic = "force-dynamic";

export default async function TutorContractPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,phone,role,account_status")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") redirect("/admin");
  if (profile?.role !== "tutor") redirect(profile?.account_status === "approved" ? "/portal" : "/portal/pending");
  // An approved tutor still belongs here until they sign, so only a rejected
  // account is sent away. The signature check below decides what to render.
  if (profile.account_status !== "pending" && profile.account_status !== "approved") {
    redirect("/portal/pending");
  }

  const admin = createAdminClient();
  const [{ data: application }, { data: signed }] = await Promise.all([
    admin
      .from("account_creation_requests")
      .select("id,status,created_at")
      .eq("user_id", user.id)
      .eq("requested_role", "tutor")
      .maybeSingle(),
    admin
      .from("tutor_contract_signatures")
      .select("id,contract_version,contract_hash,signer_name,signer_birth_date,signer_phone,signer_affiliation,signer_email,signature_path,signature_sha256,signed_at")
      .eq("tutor_id", user.id)
      .eq("contract_version", TUTOR_CONTRACT_VERSION)
      .maybeSingle(),
  ]);

  // An approved tutor who has signed is done here. A pending one keeps seeing
  // their signed receipt while admissions reviews the account.
  if (signed && profile.account_status === "approved") {
    redirect("/portal/tutor");
  }
  // A signature references the application row, so without one there is
  // nothing to sign. A rejected application waits on admissions instead.
  if (!application || application.status === "rejected") {
    redirect("/portal/pending");
  }

  let receipt: SignedContractReceipt | null = null;
  if (signed) {
    const { data: signatureUrl } = await admin.storage
      .from("tutor-contract-signatures")
      .createSignedUrl(signed.signature_path, 30 * 60);
    receipt = {
      id: signed.id,
      version: signed.contract_version,
      contractHash: signed.contract_hash,
      signerName: signed.signer_name,
      birthDate: signed.signer_birth_date,
      phone: signed.signer_phone,
      affiliation: signed.signer_affiliation,
      email: signed.signer_email,
      signatureSha256: signed.signature_sha256,
      signatureUrl: signatureUrl?.signedUrl || null,
      signedAt: signed.signed_at,
    };
  }

  return (
    <TutorContractClient
      contractHash={getTutorContractHash()}
      applicationDate={application.created_at}
      identity={{
        name: profile.full_name || "",
        email: profile.email || user.email || "",
        phone: profile.phone || "",
        applicationId: application.id,
      }}
      receipt={receipt}
    />
  );
}
