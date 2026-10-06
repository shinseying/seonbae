import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { resolvePortalDestination } from "../../../utils/auth/portal-destination";
import PendingLogoutButton from "./PendingLogoutButton";
import ResubmitForm from "./ResubmitForm";
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

  const destination = await resolvePortalDestination(user.id, profile);
  if (destination !== "/portal/pending") redirect(destination);

  const { data: request } = await supabase
    .from("account_creation_requests")
    .select("requested_role,status,acceptance_letter_name,created_at,review_note,resubmitted_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = request?.requested_role || profile?.role || "student";
  // needs_info is a 보완 요청 the applicant can answer here. rejected is final.
  const needsInfo = profile?.account_status === "needs_info" || request?.status === "needs_info";
  const rejected = !needsInfo && (profile?.account_status === "rejected" || request?.status === "rejected");
  const decided = needsInfo || rejected;

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
        <p>{needsInfo ? "REVIEW UPDATE" : rejected ? "REVIEW RESULT" : "ADMISSIONS REVIEW"}</p>
        <h1>{needsInfo ? "추가 확인이 필요합니다." : rejected ? "가입이 승인되지 않았습니다." : "가입 심사가 진행 중입니다."}</h1>
        <span>
          {needsInfo
            ? "심사팀 메모를 확인하고 아래에서 필요한 서류를 제출해 주세요. 제출하면 심사가 이어집니다."
            : rejected
              ? "이번 가입 신청은 승인되지 않았습니다. 궁금한 점은 아래 이메일로 문의해 주세요."
              : request?.resubmitted_at
                ? "보완 서류가 접수되었습니다. 선배 팀이 다시 확인하고 있습니다."
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
          <div><dt>상태</dt><dd className={decided ? styles.rejected : styles.pending}>{needsInfo ? "보완 요청" : rejected ? "반려" : "검토 중"}</dd></div>
        </dl>
        {decided && request?.review_note && <aside><b>심사팀 메모</b><p>{request.review_note}</p></aside>}
        {needsInfo && <ResubmitForm />}
        <small>문의: <a href="mailto:admissions@seonbaetutor.com">admissions@seonbaetutor.com</a></small>
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
