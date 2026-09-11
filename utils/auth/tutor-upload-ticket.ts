import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  documentExtension,
  isDocumentMimeType,
  MAX_DOCUMENT_BYTES,
  type DocumentMimeType,
} from "../files/document-rules.ts";

export const TUTOR_UPLOAD_BUCKET = "account-documents";
export const TUTOR_UPLOAD_TICKET_TTL_SECONDS = 60 * 60;
export const TUTOR_SIGNED_UPLOAD_VALIDITY_SECONDS = 2 * 60 * 60;
export const TUTOR_SIGNED_UPLOAD_CLEANUP_GRACE_SECONDS = 10 * 60;

export type TutorUploadKind = "school_proof" | "credential";

export type TutorUploadDocument = {
  kind: TutorUploadKind;
  storagePath: string;
  originalName: string;
  mimeType: DocumentMimeType;
  sizeBytes: number;
};

export type TutorUploadTicket = {
  version: 1;
  batchId: string;
  email: string;
  phone: string;
  issuedAt: number;
  expiresAt: number;
  documents: TutorUploadDocument[];
};

export type TutorUploadRequestDocument = {
  kind: TutorUploadKind;
  originalName: string;
  mimeType: DocumentMimeType;
  sizeBytes: number;
};

export function normalizeTutorUploadDocuments(value: unknown): TutorUploadRequestDocument[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 9) return null;

  const documents: TutorUploadRequestDocument[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const kind = record.kind;
    const mimeType = record.mimeType;
    const sizeBytes = Number(record.sizeBytes);
    const originalName = safeOriginalFileName(record.originalName);
    if (
      (kind !== "school_proof" && kind !== "credential")
      || !isDocumentMimeType(mimeType)
      || !Number.isInteger(sizeBytes)
      || sizeBytes < 1
      || sizeBytes > MAX_DOCUMENT_BYTES
      || !originalName
    ) {
      return null;
    }
    documents.push({ kind, mimeType, sizeBytes, originalName });
  }

  const schoolProofs = documents.filter(({ kind }) => kind === "school_proof");
  const credentials = documents.filter(({ kind }) => kind === "credential");
  return schoolProofs.length === 1 && credentials.length >= 1 && credentials.length <= 8
    ? documents
    : null;
}

export function issueTutorUploadTicket(
  email: string,
  phone: string,
  requestedDocuments: TutorUploadRequestDocument[],
  now = Date.now(),
) {
  const batchId = randomUUID();
  const issuedAt = Math.floor(now / 1000);
  const payload: TutorUploadTicket = {
    version: 1,
    batchId,
    email: email.trim().toLowerCase(),
    phone,
    issuedAt,
    expiresAt: issuedAt + TUTOR_UPLOAD_TICKET_TTL_SECONDS,
    documents: requestedDocuments.map((document, index) => ({
      ...document,
      storagePath: [
        "tutor-signup-documents",
        batchId,
        `${document.kind}-${index + 1}-${randomUUID()}.${documentExtension(document.mimeType)}`,
      ].join("/"),
    })),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { payload, ticket: `${encoded}.${signature(encoded)}` };
}

export function readTutorUploadTicket(
  token: string,
  now = Date.now(),
  allowExpiredSeconds = 0,
): TutorUploadTicket | null {
  if (typeof token !== "string" || token.length < 40 || token.length > 20_000) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, suppliedSignature] = parts;
  const expectedSignature = signature(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Partial<TutorUploadTicket>;
  const current = Math.floor(now / 1000);
  if (
    payload.version !== 1
    || !isUuid(payload.batchId)
    || typeof payload.email !== "string"
    || typeof payload.phone !== "string"
    || !Number.isInteger(payload.issuedAt)
    || !Number.isInteger(payload.expiresAt)
    || (payload.issuedAt as number) > current + 60
    || (payload.expiresAt as number) < current - allowExpiredSeconds
    || (payload.expiresAt as number) - (payload.issuedAt as number) !== TUTOR_UPLOAD_TICKET_TTL_SECONDS
  ) {
    return null;
  }

  if (!Array.isArray(payload.documents)) return null;
  const requested = normalizeTutorUploadDocuments(payload.documents.map((document) => ({
    kind: document?.kind,
    originalName: document?.originalName,
    mimeType: document?.mimeType,
    sizeBytes: document?.sizeBytes,
  })));
  if (!requested || payload.documents.length !== requested.length) return null;

  const paths = new Set<string>();
  const pathPrefix = `tutor-signup-documents/${payload.batchId}/`;
  for (let index = 0; index < payload.documents.length; index += 1) {
    const document = payload.documents[index];
    if (
      document.kind !== requested[index].kind
      || document.originalName !== requested[index].originalName
      || document.mimeType !== requested[index].mimeType
      || document.sizeBytes !== requested[index].sizeBytes
      || typeof document.storagePath !== "string"
      || !document.storagePath.startsWith(pathPrefix)
      || !/^[a-z0-9/_-]+\.(?:pdf|jpg|png)$/i.test(document.storagePath)
      || paths.has(document.storagePath)
    ) {
      return null;
    }
    paths.add(document.storagePath);
  }
  return payload as TutorUploadTicket;
}

export function tutorUploadTicketMatches(
  payload: TutorUploadTicket,
  email: string,
  phone: string,
) {
  return payload.email === email.trim().toLowerCase() && payload.phone === phone;
}

export function tutorSignedUploadCleanupTime(ticket: Pick<TutorUploadTicket, "issuedAt">) {
  return new Date((
    ticket.issuedAt
    + TUTOR_SIGNED_UPLOAD_VALIDITY_SECONDS
    + TUTOR_SIGNED_UPLOAD_CLEANUP_GRACE_SECONDS
  ) * 1_000);
}

export function safeOriginalFileName(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/[\u0000-\u001f\u007f/\\]+/g, "_").trim();
  return clean.slice(-180) || "";
}

function signature(encoded: string) {
  return createHmac("sha256", ticketSecret())
    .update(`seonbae-tutor-upload-v1.${encoded}`)
    .digest("base64url");
}

function ticketSecret() {
  const configured = process.env.TUTOR_UPLOAD_TICKET_SECRET
    || process.env.AUTH_RATE_LIMIT_SALT
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "seonbae-local-tutor-upload-ticket";
  throw new Error("Tutor upload ticket secret is not configured.");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
