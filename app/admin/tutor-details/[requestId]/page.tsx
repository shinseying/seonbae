import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import {
  isMissingDocumentsRelation,
  mergeTutorDocumentRecords,
  readContractSnapshot,
  readSubjectScores,
  type TutorDocumentRecord as DocumentRecord,
} from "../../../../utils/tutors/admin-details";
import AdminSidebar from "../../AdminSidebar";
import shellStyles from "../../applications/applications.module.css";
import styles from "../tutor-details.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { robots: { index: false, follow: false } };

type ApplicationRecord = {
  id: number;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  acceptance_letter_path: string | null;
  acceptance_letter_name: string | null;
  credential_path: string | null;
  credential_name: string | null;
  university: string | null;
  major_year: string | null;
  subjects: string | null;
  curriculum: string | null;
  official_score: string | null;
  introduction: string | null;
  subject_scores: unknown;
  languages: string | null;
  referral_code: string | null;
  applicant_note: string | null;
  status: "pending" | "approved" | "rejected";
  notification_sent_at: string | null;
  notification_error: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
};

type ProfileRecord = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  role: string;
  account_status: string;
  account_reviewed_at: string | null;
  tutor_registry_id: string | null;
  created_at: string;
};

type ContractRecord = {
  id: string;
  tutor_registry_id: string | null;
  contract_version: string;
  contract_title: string;
  contract_hash: string;
  contract_snapshot: unknown;
  signer_name: string;
  signer_birth_date: string;
  signer_phone: string;
  signer_affiliation: string;
  signer_email: string;
  signature_path: string;
  signature_sha256: string;
  accepted_at: string;
  signed_at: string;
};

type SignedDocument = {
  kind: "school_proof" | "credential";
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
  url: string | null;
};

type TutorCardRecord = {
  registry_id: string;
  roster_number: string | null;
  name: string;
  university: string;
  active: boolean;
};

export default async function AdminTutorDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("full_name,email,role")
    .eq("id", user.id)
    .single();
  if (adminProfile?.role !== "admin") redirect("/portal");

  const requestId = Number((await params).requestId);
  if (!Number.isSafeInteger(requestId) || requestId < 1) notFound();

  const admin = createAdminClient();
  const { data: applicationRow, error: applicationError } = await admin
    .from("account_creation_requests")
    .select("id,user_id,full_name,email,phone,acceptance_letter_path,acceptance_letter_name,credential_path,credential_name,university,major_year,subjects,curriculum,official_score,introduction,subject_scores,languages,referral_code,applicant_note,status,notification_sent_at,notification_error,review_note,reviewed_at,reviewed_by,created_at")
    .eq("id", requestId)
    .eq("requested_role", "tutor")
    .maybeSingle();
  if (applicationError || !applicationRow) notFound();
  const application = applicationRow as ApplicationRecord;

  const [profileResult, contractResult, normalizedDocumentResult, reviewerResult] = await Promise.all([
    application.user_id
      ? admin
          .from("profiles")
          .select("id,full_name,email,phone,role,account_status,account_reviewed_at,tutor_registry_id,created_at")
          .eq("id", application.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("tutor_contract_signatures")
      .select("id,tutor_registry_id,contract_version,contract_title,contract_hash,contract_snapshot,signer_name,signer_birth_date,signer_phone,signer_affiliation,signer_email,signature_path,signature_sha256,accepted_at,signed_at")
      .eq("application_request_id", requestId)
      .order("signed_at", { ascending: false }),
    // New signups store every upload as its own row. Older deployments do not
    // have this relation, so legacy singular columns remain a safe fallback.
    admin
      .from("account_request_documents")
      .select("kind,storage_path,original_name,mime_type,size_bytes,created_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true }),
    application.reviewed_by
      ? admin
          .from("profiles")
          .select("full_name,email")
          .eq("id", application.reviewed_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const profile = (profileResult.data ?? null) as ProfileRecord | null;
  const reviewer = reviewerResult.data as { full_name: string | null; email: string } | null;
  const contracts = (contractResult.data ?? []) as ContractRecord[];
  const documentsRelationUnavailable = Boolean(normalizedDocumentResult.error
    && !isMissingDocumentsRelation(normalizedDocumentResult.error));
  const documentRecords = normalizedDocumentResult.error
    ? []
    : (normalizedDocumentResult.data ?? []) as DocumentRecord[];
  const pendingDocuments = mergeTutorDocumentRecords(documentRecords, [
    {
      kind: "school_proof",
      path: application.acceptance_letter_path,
      name: application.acceptance_letter_name,
    },
    {
      kind: "credential",
      path: application.credential_path,
      name: application.credential_name,
    },
  ]);

  const documents: SignedDocument[] = await Promise.all(
    pendingDocuments.map(async (document) => {
      const { data } = await admin.storage
        .from("account-documents")
        .createSignedUrl(document.storage_path, 10 * 60);
      return {
        kind: document.kind,
        name: document.original_name,
        mimeType: document.mime_type,
        sizeBytes: document.size_bytes,
        createdAt: document.created_at || null,
        url: data?.signedUrl || null,
      };
    }),
  );

  const signedContracts = await Promise.all(contracts.map(async (contract) => {
    const { data } = await admin.storage
      .from("tutor-contract-signatures")
      .createSignedUrl(contract.signature_path, 10 * 60);
    return { ...contract, signatureUrl: data?.signedUrl || null };
  }));

  const cardRegistryIds = [...new Set([
    profile?.tutor_registry_id,
    ...contracts.map((contract) => contract.tutor_registry_id),
  ].filter((value): value is string => Boolean(value)))];
  const { data: tutorCardRows } = cardRegistryIds.length
    ? await admin
        .from("tutors")
        .select("registry_id,roster_number,name,university,active")
        .in("registry_id", cardRegistryIds)
    : { data: [] as TutorCardRecord[] };
  const tutorCards = new Map(
    ((tutorCardRows ?? []) as TutorCardRecord[]).map((card) => [card.registry_id, card]),
  );
  const tutorCard = profile?.tutor_registry_id
    ? tutorCards.get(profile.tutor_registry_id) ?? null
    : null;
  const subjectScores = readSubjectScores(application.subject_scores);

  return (
    <main className={shellStyles.page}>
      <AdminSidebar
        active="tutor-details"
        adminName={adminProfile.full_name || adminProfile.email || "관리자"}
        styles={shellStyles}
      />

      <section className={shellStyles.main} id="main-content">
        <Link className={styles.backLink} href="/admin/tutor-details"><span aria-hidden="true">←</span> 튜터 상세 목록</Link>
        <header className={`${shellStyles.heading} ${styles.detailHeading}`}>
          <div>
            <p>TUTOR RECORD · #{application.id}</p>
            <h1>{application.full_name}</h1>
            <span>{application.email}{application.phone ? ` · ${application.phone}` : ""}</span>
          </div>
          <StatusBadge status={application.status} />
        </header>

        <section className={styles.securityNote} aria-label="개인정보 취급 안내">
          <strong>관리자 전용 기록</strong>
          <span>서류와 전자서명 링크는 10분 동안만 유효합니다. 원본 저장 경로와 접속 감사값은 이 화면에 노출하지 않습니다.</span>
        </section>

        <div className={styles.detailGrid}>
          <section className={styles.panel} aria-labelledby="application-heading">
            <PanelHeading eyebrow="APPLICATION" title="지원 정보" id="application-heading" />
            <dl className={styles.dataList}>
              <DataRow label="신청 번호" value={`#${application.id}`} mono />
              <DataRow label="신청 시각" value={formatDateTime(application.created_at)} />
              <DataRow label="학교" value={application.university} />
              <DataRow label="전공·학년" value={application.major_year} />
              <DataRow label="지원 커리큘럼" value={application.curriculum} />
              <DataRow label="지원 과목" value={application.subjects} />
              <DataRow label="수업 가능 언어" value={application.languages} />
              <DataRow label="추천 경로·추천인" value={application.referral_code} />
              {application.official_score && <DataRow label="기존 대표 성적" value={application.official_score} />}
            </dl>

            {subjectScores.length > 0 && (
              <div className={styles.subsection}>
                <h3>과목 성적</h3>
                <ul className={styles.scoreList}>
                  {subjectScores.map((row, index) => <li key={`${row.subject}-${index}`}><span>{row.subject}</span><b>{row.score}</b></li>)}
                </ul>
              </div>
            )}

            {application.introduction && (
              <div className={styles.subsection}><h3>소개 및 수업 경험</h3><p className={styles.longText}>{application.introduction}</p></div>
            )}
            {application.applicant_note && application.applicant_note !== application.introduction && (
              <details className={styles.noteDetails}>
                <summary>추가 지원 메모</summary>
                <p className={styles.longText}>{application.applicant_note}</p>
              </details>
            )}
          </section>

          <div className={styles.sideStack}>
            <section className={styles.panel} aria-labelledby="account-heading">
              <PanelHeading eyebrow="ACCOUNT & CARD" title="계정·튜터 카드" id="account-heading" />
              <dl className={styles.dataList}>
                <DataRow label="계정 연결" value={profile ? "연결됨" : "계정 미연결"} />
                <DataRow label="계정 이름" value={profile?.full_name} />
                <DataRow label="계정 이메일" value={profile?.email} />
                <DataRow label="계정 연락처" value={profile?.phone} />
                <DataRow label="계정 상태" value={profile ? accountStatusLabel(profile.account_status) : null} />
                <DataRow label="계정 역할" value={profile?.role} />
                <DataRow label="계정 생성" value={profile ? formatDateTime(profile.created_at) : null} />
                <DataRow label="계정 심사" value={profile?.account_reviewed_at ? formatDateTime(profile.account_reviewed_at) : null} />
                <DataRow
                  label="명부 번호"
                  value={tutorCard?.roster_number || (profile?.tutor_registry_id ? "번호 준비 중" : null)}
                  mono
                />
                <DataRow label="카드 이름" value={tutorCard?.name} />
                <DataRow label="카드 학교" value={tutorCard?.university} />
                <DataRow label="카드 공개" value={tutorCard ? (tutorCard.active ? "공개" : "비공개") : null} />
              </dl>
              {profile?.tutor_registry_id && <Link className={styles.adminLink} href="/admin">튜터 명부 열기 <span aria-hidden="true">→</span></Link>}
            </section>

            <section className={styles.panel} aria-labelledby="review-heading">
              <PanelHeading eyebrow="ADMISSIONS" title="심사 기록" id="review-heading" />
              <dl className={styles.dataList}>
                <DataRow label="심사 상태" value={statusLabel(application.status)} />
                <DataRow label="처리 시각" value={application.reviewed_at ? formatDateTime(application.reviewed_at) : null} />
                <DataRow label="처리 관리자" value={reviewer ? reviewer.full_name || reviewer.email : null} />
                <DataRow label="입학팀 알림" value={application.notification_sent_at ? formatDateTime(application.notification_sent_at) : "전송 기록 없음"} />
              </dl>
              {application.review_note && <div className={styles.subsection}><h3>심사 메모</h3><p className={styles.longText}>{application.review_note}</p></div>}
              {application.notification_error && <p className={styles.inlineWarning}>이메일 알림 오류가 기록되어 있습니다.</p>}
            </section>
          </div>
        </div>

        <section className={`${styles.panel} ${styles.documentPanel}`} aria-labelledby="documents-heading">
          <PanelHeading eyebrow="PRIVATE DOCUMENTS" title="제출 서류" id="documents-heading" />
          {documentsRelationUnavailable && <p className={styles.inlineWarning}>새 형식의 서류 목록을 불러오지 못했습니다. 기존 서류만 표시합니다.</p>}
          {documents.length ? (
            <ul className={styles.documentList}>
              {documents.map((document, index) => (
                <li key={`${document.kind}-${document.name}-${index}`}>
                  <div>
                    <small>{document.kind === "school_proof" ? "학적증명서" : "성적·자격 증빙"}</small>
                    <b>{document.name}</b>
                    <span>{[
                      document.mimeType ? document.mimeType.split("/").pop()?.toUpperCase() : null,
                      formatBytes(document.sizeBytes),
                      document.createdAt ? formatDateTime(document.createdAt) : null,
                    ].filter(Boolean).join(" · ") || "제출 파일"}</span>
                  </div>
                  {document.url
                    ? <a href={document.url} target="_blank" rel="noreferrer">10분 링크로 열기 <span aria-hidden="true">↗</span></a>
                    : <span className={styles.unavailable}>링크 생성 실패</span>}
                </li>
              ))}
            </ul>
          ) : <p className={styles.emptyInner}>제출 서류가 없습니다.</p>}
        </section>

        <section className={`${styles.panel} ${styles.contractPanel}`} aria-labelledby="contracts-heading">
          <PanelHeading eyebrow="SIGNED CONTRACTS" title={`전자 계약 · ${signedContracts.length}건`} id="contracts-heading" />
          {contractResult.error && <p className={styles.inlineWarning}>전자 계약 기록을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.</p>}
          {signedContracts.length ? signedContracts.map((contract, index) => {
            const snapshot = readContractSnapshot(contract.contract_snapshot);
            return (
              <details className={styles.contract} open={index === 0} key={contract.id}>
                <summary>
                  <span><small>{contract.contract_version}</small><b>{contract.contract_title}</b></span>
                  <span><time>{formatDateTime(contract.signed_at)}</time><i aria-hidden="true" /></span>
                </summary>
                <div className={styles.contractBody}>
                  <dl className={styles.contractIdentity}>
                    <DataRow label="서명자" value={contract.signer_name} />
                    <DataRow label="생년월일" value={contract.signer_birth_date} />
                    <DataRow label="연락처" value={contract.signer_phone} />
                    <DataRow label="소속·학과" value={contract.signer_affiliation} />
                    <DataRow label="이메일" value={contract.signer_email} />
                    <DataRow label="동의 시각" value={formatDateTime(contract.accepted_at)} />
                    <DataRow label="체결 시각" value={formatDateTime(contract.signed_at)} />
                    <DataRow
                      label="연결 카드 명부 번호"
                      value={contract.tutor_registry_id
                        ? tutorCards.get(contract.tutor_registry_id)?.roster_number || "번호 준비 중"
                        : null}
                      mono
                    />
                  </dl>

                  <div className={styles.signatureBox}>
                    <h3>자필 전자서명</h3>
                    {contract.signatureUrl
                      ? <img src={contract.signatureUrl} alt={`${contract.signer_name} 튜터의 전자서명`} width="900" height="240" loading="lazy" referrerPolicy="no-referrer" />
                      : <p className={styles.emptyInner}>서명 이미지 링크를 만들지 못했습니다.</p>}
                  </div>

                  <div className={styles.hashes}>
                    <span>계약 원문 SHA-256</span><code>{contract.contract_hash}</code>
                    <span>서명 이미지 SHA-256</span><code>{contract.signature_sha256}</code>
                    <span>계약 기록 번호</span><code>{contract.id}</code>
                  </div>

                  <article className={styles.contractDocument} aria-label={`${contract.contract_title} 원문`}>
                    <header><small>서명 시점 저장 원문</small><h3>{snapshot.title || contract.contract_title}</h3>{snapshot.intro && <p>{snapshot.intro}</p>}</header>
                    {snapshot.clauses.map((clause, clauseIndex) => (
                      <section key={`${clause.title}-${clauseIndex}`}>
                        <h4>{clause.title}</h4>
                        {clause.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
                      </section>
                    ))}
                    {!snapshot.clauses.length && <p className={styles.inlineWarning}>저장된 계약 원문을 표시할 수 없습니다.</p>}
                    {snapshot.company.length > 0 && (
                      <dl className={styles.companyList}>
                        {snapshot.company.map(([key, value]) => <div key={key}><dt>{companyLabel(key)}</dt><dd>{value}</dd></div>)}
                      </dl>
                    )}
                  </article>
                </div>
              </details>
            );
          }) : <p className={styles.emptyInner}>체결된 전자 계약이 없습니다.</p>}
        </section>
      </section>
    </main>
  );
}

function PanelHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return <header className={styles.panelHeading}><div><p>{eyebrow}</p><h2 id={id}>{title}</h2></div></header>;
}

function DataRow({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? styles.mono : undefined}>{value || "미입력"}</dd></div>;
}

function StatusBadge({ status }: { status: ApplicationRecord["status"] }) {
  return <span className={styles.status} data-status={status}>{statusLabel(status)}</span>;
}

function statusLabel(status: ApplicationRecord["status"]) {
  return status === "approved" ? "승인" : status === "rejected" ? "보완 요청" : "심사 대기";
}

function accountStatusLabel(status: string) {
  if (status === "approved") return "승인";
  if (status === "rejected") return "보완 요청";
  if (status === "pending") return "심사 대기";
  return status;
}

function companyLabel(key: string) {
  if (key === "legalName") return "회사";
  if (key === "representative") return "대표이사";
  if (key === "address") return "주소";
  return key;
}

function formatBytes(value: number | null) {
  if (!value || value < 1) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
