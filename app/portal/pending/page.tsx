import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { TUTOR_CONTRACT_VERSION } from "../../../utils/contracts/tutor-contract";
import PendingLogoutButton from "./PendingLogoutButton";
import styles from "./pending.module.css";

export const dynamic = "force-dynamic";

export default async function PendingAccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,account_status")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") redirect("/admin");
  if (profile?.account_status === "approved") {
    redirect(profile.role === "tutor" ? "/portal/tutor" : "/portal");
  }

  const { data: request } = await supabase
    .from("account_creation_requests")
    .select("requested_role,status,acceptance_letter_name,created_at,review_note")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = request?.requested_role || profile?.role || "student";
  const rejected = profile?.account_status === "rejected" || request?.status === "rejected";

  if (role === "tutor" && profile?.account_status === "pending" && request?.status === "pending") {
    const { data: signature } = await supabase
      .from("tutor_contract_signatures")
      .select("id")
      .eq("tutor_id", user.id)
      .eq("contract_version", TUTOR_CONTRACT_VERSION)
      .maybeSingle();
    if (!signature) redirect("/portal/tutor/contract");
  }

  return (
    <main className={styles.page}>
      <header>
        <Link href="/" aria-label="선배 홈">
          <img src="/logo.png" alt="" width="40" height="40" />
          <span><b>Seonbae</b><small>ACCOUNT REVIEW</small></span>
        </Link>
        <PendingLogoutButton />
      </header>
      <section className={styles.card}>
        <p>{rejected ? "REVIEW UPDATE" : "ADMISSIONS REVIEW"}</p>
        <h1>{rejected ? "추가 확인이 필요합니다." : "가입 심사가 진행 중입니다."}</h1>
        <span>
          {rejected
            ? "심사 메모를 확인하고 필요한 정보를 보완해 주세요."
            : role === "tutor"
              ? "학교 이메일과 제출 서류를 선배 팀이 확인하고 있습니다."
              : "이메일 인증은 완료되었습니다. 선배 팀이 가입 정보를 확인하고 있습니다."}
        </span>
        <dl>
          <div><dt>신청자</dt><dd>{profile?.full_name || profile?.email || user.email}</dd></div>
          <div><dt>계정 유형</dt><dd>{roleLabel(role)}</dd></div>
          <div><dt>이메일</dt><dd>{profile?.email || user.email}</dd></div>
          {role === "tutor" && <div><dt>제출 문서</dt><dd>{request?.acceptance_letter_name || "학적증명서 확인 중"}</dd></div>}
          <div><dt>접수일</dt><dd>{request?.created_at ? formatDate(request.created_at) : "이메일 인증 후 접수"}</dd></div>
          <div><dt>상태</dt><dd className={rejected ? styles.rejected : styles.pending}>{rejected ? "보완 요청" : "검토 중"}</dd></div>
        </dl>
        {request?.review_note && <aside><b>심사팀 메모</b><p>{request.review_note}</p></aside>}
        <small>문의: <a href="mailto:admissions@seonbae.com">admissions@seonbae.com</a></small>
      </section>
    </main>
  );
}

function roleLabel(role?: string) {
  if (role === "parent") return "보호자";
  if (role === "tutor") return "튜터";
  return "학생";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}
