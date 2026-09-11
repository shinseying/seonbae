import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  MAX_DOCUMENT_BYTES,
  hasDocumentMagic,
} from "../utils/files/document-rules.ts";
import {
  issueTutorUploadTicket,
  normalizeTutorUploadDocuments,
  readTutorUploadTicket,
  TUTOR_SIGNED_UPLOAD_CLEANUP_GRACE_SECONDS,
  TUTOR_SIGNED_UPLOAD_VALIDITY_SECONDS,
  tutorSignedUploadCleanupTime,
  tutorUploadTicketMatches,
  type TutorUploadRequestDocument,
} from "../utils/auth/tutor-upload-ticket.ts";

process.env.TUTOR_UPLOAD_TICKET_SECRET = "test-only-tutor-upload-ticket-secret";

const validDocuments = (): TutorUploadRequestDocument[] => [
  {
    kind: "school_proof",
    originalName: "enrolment.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2_048,
  },
  {
    kind: "credential",
    originalName: "score.png",
    mimeType: "image/png",
    sizeBytes: 4_096,
  },
];

test("tutor upload metadata requires one school proof and one through eight credentials", () => {
  assert.deepEqual(normalizeTutorUploadDocuments(validDocuments()), validDocuments());
  assert.equal(normalizeTutorUploadDocuments(validDocuments().slice(0, 1)), null);
  assert.equal(normalizeTutorUploadDocuments([
    ...validDocuments(),
    { ...validDocuments()[0], originalName: "second-school-proof.pdf" },
  ]), null);
  assert.equal(normalizeTutorUploadDocuments([
    validDocuments()[0],
    ...Array.from({ length: 9 }, (_, index) => ({
      ...validDocuments()[1],
      originalName: `score-${index}.png`,
    })),
  ]), null);
});

test("tutor upload metadata enforces MIME, non-empty files, and the 10MB per-file limit", () => {
  assert.equal(normalizeTutorUploadDocuments([
    { ...validDocuments()[0], sizeBytes: MAX_DOCUMENT_BYTES + 1 },
    validDocuments()[1],
  ]), null);
  assert.equal(normalizeTutorUploadDocuments([
    validDocuments()[0],
    { ...validDocuments()[1], sizeBytes: 0 },
  ]), null);
  assert.equal(normalizeTutorUploadDocuments([
    validDocuments()[0],
    { ...validDocuments()[1], mimeType: "text/html" },
  ]), null);
});

test("signed tutor upload tickets are identity-bound, expiring, tamper-evident, and path-bound", () => {
  const now = 1_900_000_000_000;
  const issued = issueTutorUploadTicket(
    "Tutor@school.ac.kr",
    "+821012345678",
    validDocuments(),
    now,
  );
  const decoded = readTutorUploadTicket(issued.ticket, now + 1_000);

  assert.ok(decoded);
  assert.equal(tutorUploadTicketMatches(decoded, "tutor@school.ac.kr", "+821012345678"), true);
  assert.equal(tutorUploadTicketMatches(decoded, "other@school.ac.kr", "+821012345678"), false);
  assert.equal(tutorUploadTicketMatches(decoded, "tutor@school.ac.kr", "+821099999999"), false);
  assert.equal(new Set(decoded.documents.map(({ storagePath }) => storagePath)).size, 2);
  assert.ok(decoded.documents.every(({ storagePath }) => (
    storagePath.startsWith(`tutor-signup-documents/${decoded.batchId}/`)
  )));
  assert.equal(
    tutorSignedUploadCleanupTime(decoded).getTime(),
    (
      decoded.issuedAt
      + TUTOR_SIGNED_UPLOAD_VALIDITY_SECONDS
      + TUTOR_SIGNED_UPLOAD_CLEANUP_GRACE_SECONDS
    ) * 1_000,
  );

  const changedLastCharacter = issued.ticket.endsWith("a") ? "b" : "a";
  assert.equal(readTutorUploadTicket(`${issued.ticket.slice(0, -1)}${changedLastCharacter}`, now), null);
  assert.equal(readTutorUploadTicket(issued.ticket, now + 60 * 60 * 1_000 + 1_000), null);
  assert.ok(readTutorUploadTicket(issued.ticket, now + 60 * 60 * 1_000 + 1_000, 2));
});

test("document signatures reject a claimed MIME that does not match the bytes", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(hasDocumentMagic(pdf, "application/pdf"), true);
  assert.equal(hasDocumentMagic(jpeg, "image/jpeg"), true);
  assert.equal(hasDocumentMagic(png, "image/png"), true);
  assert.equal(hasDocumentMagic(pdf, "image/png"), false);
  assert.equal(hasDocumentMagic(jpeg, "application/pdf"), false);
});

test("the browser sends files to Supabase and only a ticket to the final signup request", () => {
  const source = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../app/api/auth/signup/route.ts", import.meta.url), "utf8");
  assert.match(source, /uploadToSignedUrl\(/);
  assert.match(source, /addEventListener\("pagehide", cleanupCancelledUpload\)/);
  assert.match(source, /discardTutorUpload\(uploadTicket\)/);
  assert.match(source, /signupForm\.set\("uploadTicket", uploadTicket\)/);
  assert.doesNotMatch(source, /signupForm\.(?:set|append)\("acceptanceLetter"/);
  assert.doesNotMatch(source, /signupForm\.(?:set|append)\("credentialDocuments"/);
  assert.match(routeSource, /form\.values\(\)[\s\S]*typeof value !== "string"/);
  assert.doesNotMatch(routeSource, /instanceof File|\.arrayBuffer\(\)/);
});

test("tracked batches serialize finalization and survive cancellation or completion until signed URLs expire", () => {
  const migration = readFileSync(new URL(
    "../supabase/migrations/20260912122000_tutor_signup_upload_batches.sql",
    import.meta.url,
  ), "utf8");
  const cleanupSource = readFileSync(new URL(
    "../utils/auth/tutor-upload-batch.ts",
    import.meta.url,
  ), "utf8");
  const completeRpc = migration.slice(
    migration.indexOf("create or replace function public.complete_tutor_signup_upload_batch"),
    migration.indexOf("create or replace function public.claim_expired_tutor_signup_upload_batches"),
  );
  const expiryRpc = migration.slice(
    migration.indexOf("create or replace function public.claim_expired_tutor_signup_upload_batches"),
    migration.indexOf("revoke all on function public.register_tutor_signup_upload_batch"),
  );
  assert.match(migration, /create table private\.tutor_signup_upload_batches/);
  assert.match(migration, /revoke all on table[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /batch\.status = 'pending'[\s\S]*batch\.ticket_expires_at > now\(\)/);
  assert.match(migration, /status = 'cancelled'[\s\S]*signed_uploads_expire_at/);
  assert.match(migration, /if v_signed_expiry <= now\(\)[\s\S]*return 'deleted'/);
  assert.match(migration, /return 'deferred'/);
  assert.match(migration, /status = 'completed'[\s\S]*finalization_token = null/);
  assert.match(completeRpc, /update private\.tutor_signup_upload_batches[\s\S]*status = 'completed'/);
  assert.doesNotMatch(completeRpc, /delete from private\.tutor_signup_upload_batches/);
  assert.match(completeRpc, /account_request_documents[\s\S]*stored\.storage_path = document ->> 'storagePath'/);
  assert.doesNotMatch(expiryRpc, /batch\.status = 'finalizing'/);
  assert.match(migration, /batch\.status = 'completed'[\s\S]*batch\.signed_uploads_expire_at <= now\(\)/);
  assert.match(migration, /else batch\.status <> 'completed'[\s\S]*cleanup_delete_user = candidates\.delete_user/);
  assert.match(migration, /account_request_documents[\s\S]*stored\.storage_path = document ->> 'storagePath'/);
  assert.match(cleanupSource, /if \(!row\.tracked_delete_user\)[\s\S]*account_request_documents/);
  assert.match(cleanupSource, /tracked\.filter\(\(path\) => !referenced\.has\(path\)\)/);
  assert.match(cleanupSource, /if \(row\.tracked_delete_user && row\.tracked_user_id\)/);
});

test("prepare registers before signing, final signup claims once, and cleanup is scheduled", () => {
  const prepareSource = readFileSync(new URL(
    "../app/api/auth/signup/uploads/route.ts",
    import.meta.url,
  ), "utf8");
  const finalSource = readFileSync(new URL("../app/api/auth/signup/route.ts", import.meta.url), "utf8");
  const cronSource = readFileSync(new URL(
    "../app/api/cron/tutor-upload-cleanup/route.ts",
    import.meta.url,
  ), "utf8");
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

  assert.ok(prepareSource.indexOf("await registerTutorUploadBatch") < prepareSource.indexOf(".createSignedUploadUrl"));
  assert.ok(finalSource.indexOf("await claimTutorUploadBatch") < finalSource.indexOf("await validateUploadedTutorDocuments"));
  assert.match(finalSource, /completeTutorUploadBatch/);
  assert.doesNotMatch(finalSource, /promoteTutorUploadDocuments|\.move\(/);
  assert.match(cronSource, /process\.env\.CRON_SECRET/);
  assert.match(cronSource, /timingSafeEqual/);
  assert.deepEqual(vercel.crons, [{
    path: "/api/cron/tutor-upload-cleanup",
    schedule: "17 3 * * *",
  }]);
});
