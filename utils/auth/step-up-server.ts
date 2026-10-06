import "server-only";

import { cookies } from "next/headers";
import {
  ADMIN_STEP_COOKIE,
  createVerificationCode,
  DEVICE_TRUST_COOKIE,
  peekAccessGatePayload,
  readAccessGate,
  signAccessGate,
  USER_CHALLENGE_COOKIE,
  USER_VERIFIED_COOKIE,
  verificationCodeDigest,
} from "./access-gate";
import { sendLoginVerificationEmail } from "../email/login-verification";

const CHALLENGE_SECONDS = 10 * 60;
const REMEMBER_SECONDS = 400 * 24 * 60 * 60;
const ADMIN_GATE_SECONDS = 12 * 60 * 60;

// How long a browser stays trusted for an account. Sliding, by owner decision
// on 2026-10-06: every sign-in on the browser restarts the 30 days, so a code
// is asked again only after 30 days without signing in there. The password is
// still checked on every sign-in.
const DEVICE_TRUST_SECONDS = 30 * 24 * 60 * 60;
// One browser can be trusted for several accounts (a family computer, or the
// operator testing as student, parent and tutor). Each account has its own
// signed token in the one cookie.
const MAX_TRUSTED_ACCOUNTS = 5;
const TRUST_SEPARATOR = "~";

export async function issueUserChallenge(input: {
  userId: string;
  email: string;
  sessionId: string;
  remember: boolean;
}) {
  const code = createVerificationCode();
  const expiresAt = Date.now() + CHALLENGE_SECONDS * 1000;
  const codeDigest = await verificationCodeDigest({
    code,
    userId: input.userId,
    sessionId: input.sessionId,
    expiresAt,
  });
  const token = await signAccessGate({
    kind: "user-challenge",
    userId: input.userId,
    sessionId: input.sessionId,
    expiresAt,
    codeDigest,
    attempts: 0,
    remember: input.remember,
  });

  const cookieStore = await cookies();
  clearAccessGateCookies(cookieStore);
  cookieStore.set(USER_CHALLENGE_COOKIE, token, cookieOptions(CHALLENGE_SECONDS));

  try {
    await sendLoginVerificationEmail({
      email: input.email,
      code,
      expiresAt,
      userId: input.userId,
    });
  } catch (error) {
    cookieStore.delete(USER_CHALLENGE_COOKIE);
    throw error;
  }

  return { expiresAt };
}

export async function setUserVerified(input: {
  userId: string;
  sessionId: string;
  remember: boolean;
}) {
  const token = await signAccessGate({
    kind: "user-verified",
    userId: input.userId,
    sessionId: input.sessionId,
    expiresAt: Date.now() + REMEMBER_SECONDS * 1000,
    remember: input.remember,
  });
  const cookieStore = await cookies();
  cookieStore.set(
    USER_VERIFIED_COOKIE,
    token,
    cookieOptions(input.remember ? REMEMBER_SECONDS : undefined),
  );
  cookieStore.delete(USER_CHALLENGE_COOKIE);

  // Every completed sign-in restarts this account's window on this browser.
  const trust = await signAccessGate({
    kind: "device-trust",
    userId: input.userId,
    sessionId: "",
    expiresAt: Date.now() + DEVICE_TRUST_SECONDS * 1000,
  });
  const others = trustTokens(cookieStore.get(DEVICE_TRUST_COOKIE)?.value)
    .filter((token) => {
      const payload = peekAccessGatePayload(token);
      return payload?.userId !== input.userId && Number(payload?.expiresAt) > Date.now();
    });
  cookieStore.set(
    DEVICE_TRUST_COOKIE,
    [trust, ...others].slice(0, MAX_TRUSTED_ACCOUNTS).join(TRUST_SEPARATOR),
    cookieOptions(DEVICE_TRUST_SECONDS),
  );
}

/** True when this account signed in on this browser inside the window. */
export async function deviceIsTrusted(userId: string) {
  const cookieStore = await cookies();
  for (const token of trustTokens(cookieStore.get(DEVICE_TRUST_COOKIE)?.value)) {
    if (await readAccessGate(token, "device-trust", { userId, sessionId: "" })) return true;
  }
  return false;
}

/** A password change voids this browser's trust for the account. */
export async function clearDeviceTrust(userId: string) {
  const cookieStore = await cookies();
  const kept = trustTokens(cookieStore.get(DEVICE_TRUST_COOKIE)?.value)
    .filter((token) => peekAccessGatePayload(token)?.userId !== userId);
  if (kept.length) cookieStore.set(DEVICE_TRUST_COOKIE, kept.join(TRUST_SEPARATOR), cookieOptions(DEVICE_TRUST_SECONDS));
  else cookieStore.delete(DEVICE_TRUST_COOKIE);
}

function trustTokens(value: string | undefined) {
  return (value || "").split(TRUST_SEPARATOR).filter(Boolean).slice(0, MAX_TRUSTED_ACCOUNTS);
}

export async function setAdminPhraseVerified(input: {
  userId: string;
  sessionId: string;
}) {
  const token = await signAccessGate({
    kind: "admin-step",
    userId: input.userId,
    sessionId: input.sessionId,
    expiresAt: Date.now() + ADMIN_GATE_SECONDS * 1000,
  });
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_STEP_COOKIE, token, cookieOptions(ADMIN_GATE_SECONDS));
}

/** Session-scoped gates only. Device trust survives logout on purpose. */
export function clearAccessGateCookies(cookieStore: {
  delete(name: string): void;
}) {
  cookieStore.delete(USER_CHALLENGE_COOKIE);
  cookieStore.delete(USER_VERIFIED_COOKIE);
  cookieStore.delete(ADMIN_STEP_COOKIE);
}

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  };
}
