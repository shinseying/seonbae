import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredTutorUploadBatches } from "../../../../utils/auth/tutor-upload-batch";
import { createAdminClient } from "../../../../utils/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return json({ error: "Cleanup service is unavailable" }, 503);
  }

  const result = await cleanupExpiredTutorUploadBatches(admin, 25);
  return json(result, result.failed > 0 ? 503 : 200);
}

function isAuthorizedCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization) return false;
  const supplied = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
