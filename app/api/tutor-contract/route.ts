import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  authRateLimitResponse,
  consumeAuthRateLimit,
} from "../../../utils/auth/rate-limit";
import { getTutorContractHash } from "../../../utils/contracts/hash";
import {
  TUTOR_CONTRACT_SNAPSHOT,
  TUTOR_CONTRACT_TITLE,
  TUTOR_CONTRACT_VERSION,
} from "../../../utils/contracts/tutor-contract";
import { registryRowFromApplication } from "../../../utils/tutors/from-application";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

const MAX_SIGNATURE_BYTES = 350 * 1024;
const PNG_PREFIX = "data:image/png;base64,";

type ContractBody = {
  contractHash?: unknown;
  signerName?: unknown;
  birthDate?: unknown;
  affiliation?: unknown;
  accepted?: unknown;
  signatureDataUrl?: unknown;
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("허용되지 않은 요청입니다.", 403);

  const rateLimit = await consumeAuthRateLimit(request, "contract_signature");
  if (!rateLimit.allowed) return authRateLimitResponse(rateLimit.retryAfterSeconds);

  let body: ContractBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("서명 정보를 다시 확인해 주세요.", 400);
  }

  const serverContractHash = getTutorContractHash();
  const suppliedHash = text(body.contractHash, 64).toLowerCase();
  const signerName = text(body.signerName, 80).replace(/\s+/g, " ");
  const birthDate = text(body.birthDate, 10);
  const affiliation = text(body.affiliation, 120).replace(/\s+/g, " ");
  const signatureDataUrl = typeof body.signatureDataUrl === "string" ? body.signatureDataUrl : "";

  if (!safeHashMatch(suppliedHash, serverContractHash)) {
    return jsonError("계약서 버전이 변경되었습니다. 새로고침 후 다시 확인해 주세요.", 409);
  }
  if (body.accepted !== true) return jsonError("계약 내용을 확인하고 동의해 주세요.", 400);
  if (signerName.length < 2 || affiliation.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return jsonError("성명, 생년월일, 소속·학과를 확인해 주세요.", 400);
  }

  const signature = decodeSignature(signatureDataUrl);
  if (!signature) return jsonError("서명을 다시 작성해 주세요.", 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,phone,role,account_status,tutor_registry_id")
    .eq("id", user.id)
    .single();

  // Approved accounts sign here too: the contract gates portal access, so a
  // tutor provisioned by an admin still has to sign before the account works.
  if (
    !profile
    || profile.role !== "tutor"
    || (profile.account_status !== "pending" && profile.account_status !== "approved")
  ) {
    return jsonError("튜터 계정만 계약할 수 있습니다.", 403);
  }
  if (!sameIdentity(signerName, profile.full_name || "")) {
    return jsonError("서명자 성명은 승인된 계정의 이름과 같아야 합니다.", 400);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("계약 저장 시스템이 설정되지 않았습니다.", 503);
  }

  const [{ data: application }, { data: existing }] = await Promise.all([
    admin
      .from("account_creation_requests")
      .select("id,user_id,email,full_name,requested_role,status,university,subjects,curriculum,official_score,introduction,created_at")
      .eq("user_id", user.id)
      .eq("requested_role", "tutor")
      .maybeSingle(),
    admin
      .from("tutor_contract_signatures")
      .select("id,signed_at")
      .eq("tutor_id", user.id)
      .eq("contract_version", TUTOR_CONTRACT_VERSION)
      .maybeSingle(),
  ]);

  // A signature row references the application, so one has to exist. Only the
  // decision matters here: an approved tutor signs on the same page as a
  // pending one, and a rejected application cannot sign at all.
  if (!application) {
    return jsonError("튜터 지원 기록을 확인하지 못했습니다.", 403);
  }
  if (application.status === "rejected") {
    return jsonError("보완 요청된 지원서입니다. 입학팀 안내를 확인해 주세요.", 403);
  }
  const destination = profile.account_status === "approved" ? "/portal/tutor" : "/portal/pending";
  if (existing) {
    return NextResponse.json(
      { signed: true, signedAt: existing.signed_at, destination },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }

  let tutorRegistryId = profile.tutor_registry_id;
  if (!tutorRegistryId) {
    tutorRegistryId = `T-${user.id.slice(0, 8).toUpperCase()}`;
    const { error: tutorError } = await admin
      .from("tutors")
      .upsert(registryRowFromApplication(tutorRegistryId, application), {
        onConflict: "registry_id",
      });
    if (tutorError) return jsonError("계약용 튜터 기록을 준비하지 못했습니다.", 500);

    const { error: profileError } = await admin
      .from("profiles")
      .update({ tutor_registry_id: tutorRegistryId, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .in("account_status", ["pending", "approved"]);
    if (profileError) return jsonError("계약용 튜터 기록을 연결하지 못했습니다.", 500);
  }

  const signedAt = new Date().toISOString();
  const signatureSha256 = createHash("sha256").update(signature).digest("hex");
  const signaturePath = `${user.id}/${TUTOR_CONTRACT_VERSION}/${randomUUID()}.png`;
  const auditSecret = process.env.CONTRACT_AUDIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!auditSecret) return jsonError("계약 감사 기록이 설정되지 않았습니다.", 503);

  const upload = await admin.storage
    .from("tutor-contract-signatures")
    .upload(signaturePath, signature, { contentType: "image/png", cacheControl: "0", upsert: false });
  if (upload.error) return jsonError("서명 이미지를 안전하게 저장하지 못했습니다.", 500);

  const insert = await admin
    .from("tutor_contract_signatures")
    .insert({
      tutor_id: user.id,
      application_request_id: application.id,
      tutor_registry_id: tutorRegistryId,
      contract_version: TUTOR_CONTRACT_VERSION,
      contract_title: TUTOR_CONTRACT_TITLE,
      contract_hash: serverContractHash,
      contract_snapshot: TUTOR_CONTRACT_SNAPSHOT,
      signer_name: signerName,
      signer_birth_date: birthDate,
      signer_phone: profile.phone || "미등록",
      signer_affiliation: affiliation,
      signer_email: profile.email || user.email || "",
      signature_path: signaturePath,
      signature_sha256: signatureSha256,
      signing_method: "drawn_signature_and_explicit_consent",
      accepted_at: signedAt,
      signed_at: signedAt,
      approval_snapshot: {
        applicationRequestId: application.id,
        status: application.status,
        applicationCreatedAt: application.created_at,
        signedBeforeAdminDecision: application.status === "pending",
      },
      ip_address_hash: auditHash(auditSecret, clientIp(request)),
      user_agent_hash: auditHash(auditSecret, request.headers.get("user-agent") || "unknown"),
    })
    .select("id,signed_at")
    .single();

  if (insert.error || !insert.data) {
    await admin.storage.from("tutor-contract-signatures").remove([signaturePath]);
    if (insert.error?.code === "23505") {
      return NextResponse.json(
        { signed: true, destination },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }
    console.error("Tutor contract insert failed", { code: insert.error?.code, message: insert.error?.message });
    return jsonError("계약 기록을 저장하지 못했습니다.", 500);
  }

  return NextResponse.json(
    { signed: true, signedAt: insert.data.signed_at, destination },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sameIdentity(left: string, right: string) {
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko");
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}

function safeHashMatch(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function decodeSignature(value: string) {
  if (!value.startsWith(PNG_PREFIX)) return null;
  try {
    const buffer = Buffer.from(value.slice(PNG_PREFIX.length), "base64");
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 256 || buffer.length > MAX_SIGNATURE_BYTES || !buffer.subarray(0, 8).equals(pngMagic)) return null;
    return buffer;
  } catch {
    return null;
  }
}

function isSameOrigin(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || request.headers.get("x-real-ip")
    || "unknown"
  ).split(",")[0]?.trim() || "unknown";
}

function auditHash(secret: string, value: string) {
  return createHmac("sha256", secret).update(`seonbae-contract:${value}`).digest("hex");
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
