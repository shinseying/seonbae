import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import AdminSidebar from "../AdminSidebar";
import shellStyles from "../applications/applications.module.css";
import styles from "./tutor-details.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { robots: { index: false, follow: false } };

type TutorApplication = {
  id: number;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  university: string | null;
  curriculum: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
};

type ProfileSummary = {
  id: string;
  account_status: string;
  tutor_registry_id: string | null;
};

type ContractSummary = {
  application_request_id: number;
  contract_version: string;
  signed_at: string;
};

type TutorCardSummary = {
  registry_id: string;
  roster_number: string | null;
};

type PageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

export default async function AdminTutorDetailsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("full_name,email,role")
    .eq("id", user.id)
    .single();
  if (adminProfile?.role !== "admin") redirect("/portal");

  const admin = createAdminClient();
  const { data: applicationRows, error } = await admin
    .from("account_creation_requests")
    .select("id,user_id,full_name,email,phone,university,curriculum,status,created_at,reviewed_at")
    .eq("requested_role", "tutor")
    .order("created_at", { ascending: false });

  const applications = (applicationRows ?? []) as TutorApplication[];
  const requestIds = applications.map((item) => item.id);
  const userIds = applications
    .map((item) => item.user_id)
    .filter((value): value is string => Boolean(value));

  const [{ data: profileRows }, { data: signatureRows }] = await Promise.all([
    userIds.length
      ? admin
          .from("profiles")
          .select("id,account_status,tutor_registry_id")
          .in("id", userIds)
      : Promise.resolve({ data: [] as ProfileSummary[] }),
    requestIds.length
      ? admin
          .from("tutor_contract_signatures")
          .select("application_request_id,contract_version,signed_at")
          .in("application_request_id", requestIds)
          .order("signed_at", { ascending: false })
      : Promise.resolve({ data: [] as ContractSummary[] }),
  ]);

  const profiles = new Map(
    ((profileRows ?? []) as ProfileSummary[]).map((profile) => [profile.id, profile]),
  );
  const tutorRegistryIds = [...new Set(
    ((profileRows ?? []) as ProfileSummary[])
      .map((profile) => profile.tutor_registry_id)
      .filter((value): value is string => Boolean(value)),
  )];
  const { data: tutorCardRows } = tutorRegistryIds.length
    ? await admin
        .from("tutors")
        .select("registry_id,roster_number")
        .in("registry_id", tutorRegistryIds)
    : { data: [] as TutorCardSummary[] };
  const tutorCards = new Map(
    ((tutorCardRows ?? []) as TutorCardSummary[]).map((card) => [card.registry_id, card]),
  );
  const contracts = new Map<number, ContractSummary[]>();
  for (const contract of (signatureRows ?? []) as ContractSummary[]) {
    const rows = contracts.get(contract.application_request_id) ?? [];
    rows.push(contract);
    contracts.set(contract.application_request_id, rows);
  }

  const params = await searchParams;
  const query = cleanSearch(params.q);
  const status = isStatus(params.status) ? params.status : "all";
  const visible = applications.filter((item) => {
    if (status !== "all" && item.status !== status) return false;
    if (!query) return true;
    const profile = item.user_id ? profiles.get(item.user_id) : null;
    const rosterNumber = profile?.tutor_registry_id
      ? tutorCards.get(profile.tutor_registry_id)?.roster_number
      : null;
    return [item.full_name, item.email, item.phone, item.university, item.curriculum, rosterNumber, String(item.id)]
      .filter(Boolean)
      .some((value) => String(value).normalize("NFKC").toLocaleLowerCase("ko").includes(query));
  });

  const signedCount = applications.filter((item) => (contracts.get(item.id)?.length ?? 0) > 0).length;

  return (
    <main className={shellStyles.page}>
      <AdminSidebar
        active="tutor-details"
        adminName={adminProfile.full_name || adminProfile.email || "관리자"}
        styles={shellStyles}
      />

      <section className={shellStyles.main} id="main-content">
        <header className={shellStyles.heading}>
          <div>
            <p>TUTOR RECORDS · ADMIN ONLY</p>
            <h1>튜터 상세 정보</h1>
            <span>튜터 지원 내용, 제출 서류, 계정 연결 및 계약 체결 기록을 확인합니다.</span>
          </div>
          <b>전체 {applications.length} · 계약 {signedCount}</b>
        </header>

        <section className={styles.securityNote} aria-label="개인정보 취급 안내">
          <strong>관리자 전용 기록</strong>
          <span>서류와 계약 링크는 짧은 시간만 유효합니다. 화면이나 파일을 외부에 공유하지 마세요.</span>
        </section>

        <form className={styles.filters} method="get" role="search">
          <label>
            <span>튜터 검색</span>
            <input
              type="search"
              name="q"
              defaultValue={params.q || ""}
              placeholder="이름, 이메일, 학교, 신청 번호"
              maxLength={100}
            />
          </label>
          <label>
            <span>심사 상태</span>
            <select name="status" defaultValue={status}>
              <option value="all">전체 상태</option>
              <option value="pending">심사 대기</option>
              <option value="approved">승인</option>
              <option value="rejected">보완 요청</option>
            </select>
          </label>
          <button type="submit">검색</button>
          {(query || status !== "all") && <Link href="/admin/tutor-details">초기화</Link>}
        </form>

        {error ? (
          <p className={styles.empty} role="alert">튜터 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        ) : visible.length ? (
          <ol className={styles.records}>
            {visible.map((item) => {
              const profile = item.user_id ? profiles.get(item.user_id) : null;
              const rosterNumber = profile?.tutor_registry_id
                ? tutorCards.get(profile.tutor_registry_id)?.roster_number
                : null;
              const signed = contracts.get(item.id) ?? [];
              return (
                <li key={item.id}>
                  <Link className={styles.recordCard} href={`/admin/tutor-details/${item.id}`}>
                    <div className={styles.recordHeading}>
                      <span className={styles.avatar} aria-hidden="true">{initials(item.full_name)}</span>
                      <div>
                        <small>지원 #{item.id}</small>
                        <h2>{item.full_name}</h2>
                        <p>{item.email}{item.phone ? ` · ${item.phone}` : ""}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <dl className={styles.recordMeta}>
                      <div><dt>학교·과정</dt><dd>{[item.university, item.curriculum].filter(Boolean).join(" · ") || "미입력"}</dd></div>
                      <div><dt>계정</dt><dd>{item.user_id ? profile?.account_status || "연결됨" : "계정 미연결"}</dd></div>
                      <div><dt>명부 번호</dt><dd>{rosterNumber || (profile?.tutor_registry_id ? "번호 준비 중" : "미연결")}</dd></div>
                      <div><dt>계약</dt><dd>{signed.length ? `${signed.length}건 · ${formatDateTime(signed[0].signed_at)}` : "서명 전"}</dd></div>
                    </dl>
                    <footer><time>{formatDate(item.created_at)} 신청</time><b>상세 기록 보기 <span aria-hidden="true">→</span></b></footer>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={styles.empty}>조건에 맞는 튜터 기록이 없습니다.</p>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: TutorApplication["status"] }) {
  const label = status === "approved" ? "승인" : status === "rejected" ? "보완 요청" : "심사 대기";
  return <span className={styles.status} data-status={status}>{label}</span>;
}

function isStatus(value: unknown): value is "all" | TutorApplication["status"] {
  return value === "all" || value === "pending" || value === "approved" || value === "rejected";
}

function cleanSearch(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, 100).normalize("NFKC").toLocaleLowerCase("ko")
    : "";
}

function initials(value: string) {
  const clean = value.trim();
  if (!clean) return "선";
  return /^[가-힣]/.test(clean)
    ? clean.slice(-2)
    : clean.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
