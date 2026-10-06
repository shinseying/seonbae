import "server-only";

import { createAdminClient } from "../supabase/admin";
import { TUTOR_UPLOAD_BUCKET } from "./tutor-upload-ticket";

type AdminClient = ReturnType<typeof createAdminClient>;

// Documents an applicant uploads after a 보완 요청 live in one flat folder, so
// a single listing finds the ones that were never submitted.
export const RESUBMISSION_PREFIX = "resubmissions";

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

// An upload is referenced once "submit" records it. Anything older than a day
// with no document row was abandoned between the two steps.
export async function cleanupAbandonedResubmissions(admin: AdminClient) {
  const storage = admin.storage.from(TUTOR_UPLOAD_BUCKET);
  const cutoff = Date.now() - ORPHAN_AGE_MS;
  const stale: string[] = [];
  // Submitted files stay in the folder, so page through it rather than read
  // only the oldest page. Ten pages is far beyond the expected volume.
  for (let page = 0; page < 10; page += 1) {
    const { data: objects, error } = await storage.list(RESUBMISSION_PREFIX, {
      limit: 100,
      offset: page * 100,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) return { removed: 0, failed: 1 };
    for (const object of objects ?? []) {
      if (object.id && object.created_at && Date.parse(object.created_at) < cutoff) {
        stale.push(`${RESUBMISSION_PREFIX}/${object.name}`);
      }
    }
    if ((objects ?? []).length < 100) break;
  }
  if (!stale.length) return { removed: 0, failed: 0 };

  // Chunked so the path list stays inside a request URL.
  const kept = new Set<string>();
  for (let start = 0; start < stale.length; start += 50) {
    const { data: referenced, error: lookupError } = await admin
      .from("account_request_documents")
      .select("storage_path")
      .in("storage_path", stale.slice(start, start + 50));
    if (lookupError) return { removed: 0, failed: 1 };
    for (const row of referenced ?? []) kept.add(row.storage_path);
  }
  const orphans = stale.filter((path) => !kept.has(path));
  if (!orphans.length) return { removed: 0, failed: 0 };

  const { error: removeError } = await storage.remove(orphans);
  return removeError ? { removed: 0, failed: 1 } : { removed: orphans.length, failed: 0 };
}
