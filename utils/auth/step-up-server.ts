import "server-only";

import { cookies } from "next/headers";
import {
  ADMIN_STEP_COOKIE,
  createVerificationCode,
  DEVICE_TRUST_COOKIE,
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

// How long a browser stays trusted after a code was entered on it. 30 days is
// what Google, Microsoft, GitHub and Okta all default "remember this device"
// to, and re-prompting sooner trains people to expect a code and to type one
// into whatever asks. Absolute, not sliding: the window runs from the last
// verification, so a browser can never stay trusted indefinitely by being used.
const DEVICE_TRUST_SECONDS = 30 * 24 * 60 * 60;

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
  /** False when the session was let through by an existing trusted device: the
   *  window has to run from the verification that earned it, not from its reuse. */
  trustDevice?: boolean;
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

  if (input.trustDevice !== false) {
    const trust = await signAccessGate({
      kind: "device-trust",
      userId: input.userId,
      sessionId: "",
      expiresAt: Date.now() + DEVICE_TRUST_SECONDS * 1000,
    });
    cookieStore.set(DEVICE_TRUST_COOKIE, trust, cookieOptions(DEVICE_TRUST_SECONDS));
  }
}

/** True when this browser entered a code for this account inside the window. */
export async function deviceIsTrusted(userId: string) {
  const cookieStore = await cookies();
  const trust = await readAccessGate(
    cookieStore.get(DEVICE_TRUST_COOKIE)?.value,
    "device-trust",
    { userId, sessionId: "" },
  );
  return Boolean(trust);
}

/** Password changes and account recovery void the trust every browser holds. */
export async function clearDeviceTrust() {
  const cookieStore = await cookies();
  cookieStore.delete(DEVICE_TRUST_COOKIE);
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
