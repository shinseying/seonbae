import { redirect } from "next/navigation";
import { getTutorContractHash } from "../../../../utils/contracts/hash";
import { TUTOR_CONTRACT_VERSION } from "../../../../utils/contracts/tutor-contract";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import {
  ensureTutorApplicationRecord,
  TutorApplicationLinkError,
} from "../../../../utils/tutors/application-link";
import TutorContractClient, { type SignedContractReceipt } from "./TutorContractClient";
import styles from "./contract.module.css";

export const dynamic = "force-dynamic";

export default async function TutorContractPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,phone,role,account_status,account_reviewed_at")
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
  const { data: signed } = await admin
    .from("tutor_contract_signatures")
    .select("id,contract_version,contract_hash,signer_name,signer_birth_date,signer_phone,signer_affiliation,signer_email,signature_path,signature_sha256,signed_at")
    .eq("tutor_id", user.id)
    .eq("contract_version", TUTOR_CONTRACT_VERSION)
    .maybeSingle();

  // An approved tutor who has signed is done here. A pending one keeps seeing
  // their signed receipt while admissions reviews the account.
  if (signed && profile.account_status === "approved") {
    redirect("/portal/tutor");
  }

  let application;
  try {
    application = (await ensureTutorApplicationRecord(admin, user.id, profile)).application;
  } catch (error) {
    const message = error instanceof TutorApplicationLinkError
      ? error.message
      : "계약 연결 정보를 복구하지 못했습니다.";
    return <ContractLinkRecovery message={message} />;
  }

  // A rejected pending account still belongs in admissions. An approved
  // account with a contradictory rejected record stays on a stable recovery
  // screen instead of entering a redirect cycle.
  if (application.status === "rejected") {
    if (profile.account_status === "approved") {
      return <ContractLinkRecovery message="승인 계정과 지원 기록의 상태가 달라 관리자 확인이 필요합니다." />;
    }
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

function ContractLinkRecovery({ message }: { message: string }) {
  return (
    <main className={styles.page}>
      <section className={styles.document}>
        <div className={styles.documentHeading}>
          <p>ACCOUNT LINK RECOVERY</p>
          <h2>계약 연결 정보를 확인하고 있습니다.</h2>
          <span>
            {message}<br />페이지를 반복해서 이동하지 않아도 됩니다. 선배 팀이 계정 기록을 확인한 뒤 안내드리겠습니다.
          </span>
          <a href="mailto:admissions@seonbae.com">admissions@seonbae.com</a>
        </div>
      </section>
    </main>
  );
}
