import "server-only";

import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../supabase/admin";

export type AuthRateLimitAction =
  | "authenticate"
  | "signup"
  | "recovery"
  | "password_update"
  | "consultation"
  | "contract_signature";

const policies: Record<
  AuthRateLimitAction,
  { limit: number; windowSeconds: number }
> = {
  authenticate: { limit: 10, windowSeconds: 5 * 60 },
  signup: { limit: 5, windowSeconds: 15 * 60 },
  recovery: { limit: 3, windowSeconds: 15 * 60 },
  password_update: { limit: 5, windowSeconds: 15 * 60 },
  consultation: { limit: 5, windowSeconds: 15 * 60 },
  contract_signature: { limit: 5, windowSeconds: 15 * 60 },
};

export async function consumeAuthRateLimit(
  request: NextRequest,
  action: AuthRateLimitAction,
) {
  const policy = policies[action];
  const keyHash = requestKeyHash(request);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_auth_request_limit", {
      p_key_hash: keyHash,
      p_action: action,
      p_limit: policy.limit,
      p_window_seconds: policy.windowSeconds,
    });

    if (error) {
      console.error("Auth rate-limit check failed", {
        action,
        code: error.code,
        message: error.message,
      });
      return { allowed: false, retryAfterSeconds: 0 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed !== false,
      retryAfterSeconds:
        typeof row?.retry_after_seconds === "number"
          ? Math.max(0, row.retry_after_seconds)
          : policy.windowSeconds,
    };
  } catch (error) {
    console.error("Auth rate-limit service is unavailable", {
      action,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return { allowed: false, retryAfterSeconds: 0 };
  }
}

export function authRateLimitResponse(retryAfterSeconds: number) {
  if (retryAfterSeconds <= 0) {
    return NextResponse.json(
      { error: "보안 확인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Retry-After": "30",
        },
      },
    );
  }

  return NextResponse.json(
    {
      error:
        "요청이 너무 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.",
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
      },
    },
  );
}

function requestKeyHash(request: NextRequest) {
  const forwardedFor =
    request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || request.headers.get("x-real-ip")
    || "unknown";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";
  const hmacSecret =
    process.env.AUTH_RATE_LIMIT_SALT
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "seonbae-auth-rate-limit-v1";

  return createHmac("sha256", hmacSecret)
    .update(`seonbae-auth:${clientIp}`)
    .digest("hex");
}
