import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
import { cleanupTutorUploadPaths } from "./tutor-upload-storage";
import {
  tutorSignedUploadCleanupTime,
  type TutorUploadTicket,
} from "./tutor-upload-ticket";

type AdminClient = ReturnType<typeof createAdminClient>;

const TRACKED_PATH_PREFIX = "tutor-signup-documents";

type CleanupRow = {
  tracked_batch_id: string;
  tracked_documents: unknown;
  tracked_user_id: string | null;
  signed_uploads_expire_at: string;
  tracked_delete_user: boolean;
};

export async function registerTutorUploadBatch(
  admin: AdminClient,
  ticket: TutorUploadTicket,
) {
  const { data, error } = await admin.rpc("register_tutor_signup_upload_batch", {
    p_batch_id: ticket.batchId,
    p_email: ticket.email,
    p_phone: ticket.phone,
    p_documents: ticket.documents,
    p_ticket_expires_at: new Date(ticket.expiresAt * 1_000).toISOString(),
    p_signed_uploads_expire_at: tutorSignedUploadCleanupTime(ticket).toISOString(),
  });
  if (error || data !== true) {
    logBatchError("register", error);
    return false;
  }
  return true;
}

export async function claimTutorUploadBatch(
  admin: AdminClient,
  ticket: TutorUploadTicket,
  finalizationToken: string,
) {
  const { data, error } = await admin.rpc("claim_tutor_signup_upload_batch", {
    p_batch_id: ticket.batchId,
    p_email: ticket.email,
    p_phone: ticket.phone,
    p_documents: ticket.documents,
    p_finalization_token: finalizationToken,
  });
  if (error) logBatchError("claim", error);
  return !error && data === true;
}

export async function attachTutorUploadUser(
  admin: AdminClient,
  batchId: string,
  finalizationToken: string,
  userId: string,
) {
  const { data, error } = await admin.rpc("attach_tutor_signup_upload_user", {
    p_batch_id: batchId,
    p_finalization_token: finalizationToken,
    p_user_id: userId,
  });
  if (error) logBatchError("attach-user", error);
  return !error && data === true;
}

export async function cancelTutorUploadBatch(
  admin: AdminClient,
  ticket: TutorUploadTicket,
) {
  const cleanupToken = randomUUID();
  const { data, error } = await admin.rpc("cancel_tutor_signup_upload_batch", {
    p_batch_id: ticket.batchId,
    p_email: ticket.email,
    p_phone: ticket.phone,
    p_documents: ticket.documents,
    p_cleanup_token: cleanupToken,
  });
  if (error) {
    logBatchError("cancel", error);
    return false;
  }
  const row = firstCleanupRow(data);
  // Missing means the batch was completed, is actively finalizing, or another
  // cleanup worker owns it. Never delete paths without the database claim.
  if (!row) return true;
  return cleanClaimedBatch(admin, row, cleanupToken);
}

export async function failTutorUploadBatch(
  admin: AdminClient,
  ticket: TutorUploadTicket,
  finalizationToken: string,
) {
  const cleanupToken = randomUUID();
  const { data, error } = await admin.rpc("fail_tutor_signup_upload_batch", {
    p_batch_id: ticket.batchId,
    p_finalization_token: finalizationToken,
    p_cleanup_token: cleanupToken,
  });
  if (error) {
    logBatchError("fail", error);
    return false;
  }
  const row = firstCleanupRow(data);
  return row ? cleanClaimedBatch(admin, row, cleanupToken) : false;
}

export async function completeTutorUploadBatch(
  admin: AdminClient,
  batchId: string,
  finalizationToken: string,
) {
  const { data, error } = await admin.rpc("complete_tutor_signup_upload_batch", {
    p_batch_id: batchId,
    p_finalization_token: finalizationToken,
  });
  if (error || data !== true) {
    logBatchError("complete", error);
    return false;
  }
  return true;
}

export async function cleanupExpiredTutorUploadBatches(
  admin: AdminClient,
  limit = 20,
) {
  const cleanupToken = randomUUID();
  const { data, error } = await admin.rpc("claim_expired_tutor_signup_upload_batches", {
    p_cleanup_token: cleanupToken,
    p_limit: Math.min(50, Math.max(1, Math.trunc(limit))),
  });
  if (error) {
    logBatchError("claim-expired", error);
    return { claimed: 0, cleaned: 0, failed: 1 };
  }

  const rows = Array.isArray(data)
    ? data.map(parseCleanupRow).filter((row): row is CleanupRow => Boolean(row))
    : [];
  const results = await Promise.all(rows.map((row) => cleanClaimedBatch(admin, row, cleanupToken)));
  const cleaned = results.filter(Boolean).length;
  return { claimed: rows.length, cleaned, failed: rows.length - cleaned };
}

async function cleanClaimedBatch(
  admin: AdminClient,
  row: CleanupRow,
  cleanupToken: string,
) {
  const tracked = trackedPaths(row.tracked_documents, row.tracked_batch_id);
  if (!tracked) return false;

  // Completed applications keep their account and any still-referenced
  // documents. Only an object whose application row disappeared (including a
  // replay after admin deletion) is safe to remove.
  let paths = tracked;
  if (!row.tracked_delete_user) {
    const { data, error } = await admin
      .from("account_request_documents")
      .select("storage_path")
      .in("storage_path", tracked);
    if (error) {
      logBatchError("find-referenced-documents", error);
      return false;
    }
    const referenced = new Set((data || []).map(({ storage_path }) => storage_path));
    paths = tracked.filter((path) => !referenced.has(path));
  }
  if (!(await cleanupTutorUploadPaths(admin, paths))) return false;

  if (row.tracked_delete_user && row.tracked_user_id) {
    const { error } = await admin.auth.admin.deleteUser(row.tracked_user_id);
    if (error && Number(error.status) !== 404) {
      logBatchError("delete-orphan-user", error);
      return false;
    }
  }

  const { data, error } = await admin.rpc("ack_tutor_signup_upload_cleanup", {
    p_batch_id: row.tracked_batch_id,
    p_cleanup_token: cleanupToken,
  });
  if (error || (data !== "deleted" && data !== "deferred")) {
    logBatchError("ack-cleanup", error);
    return false;
  }
  return true;
}

function firstCleanupRow(value: unknown) {
  if (!Array.isArray(value) || value.length !== 1) return null;
  return parseCleanupRow(value[0]);
}

function parseCleanupRow(value: unknown): CleanupRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.tracked_batch_id !== "string"
    || !isUuid(row.tracked_batch_id)
    || !Array.isArray(row.tracked_documents)
    || (row.tracked_user_id !== null && row.tracked_user_id !== undefined && !isUuid(row.tracked_user_id))
    || typeof row.signed_uploads_expire_at !== "string"
    || typeof row.tracked_delete_user !== "boolean"
  ) {
    return null;
  }
  return {
    tracked_batch_id: row.tracked_batch_id,
    tracked_documents: row.tracked_documents,
    tracked_user_id: typeof row.tracked_user_id === "string" ? row.tracked_user_id : null,
    signed_uploads_expire_at: row.signed_uploads_expire_at,
    tracked_delete_user: row.tracked_delete_user,
  };
}

function trackedPaths(value: unknown, batchId: string) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 9) return null;
  const prefix = `${TRACKED_PATH_PREFIX}/${batchId}/`;
  const paths: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const path = (item as Record<string, unknown>).storagePath;
    if (typeof path !== "string" || !path.startsWith(prefix) || path.length > 500) return null;
    paths.push(path);
  }
  return new Set(paths).size === paths.length ? paths : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function logBatchError(operation: string, error: unknown) {
  if (!error) return;
  const record = error as { code?: string; message?: string };
  console.error("[tutor upload batch]", {
    operation,
    code: record.code,
    message: record.message,
  });
}
