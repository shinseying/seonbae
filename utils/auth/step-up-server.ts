import "server-only";

import { cookies } from "next/headers";
import {
  ADMIN_ENTRY_COOKIE,
  ADMIN_STEP_COOKIE,
  createVerificationCode,
  signAccessGate,
  USER_CHALLENGE_COOKIE,
  USER_VERIFIED_COOKIE,
  verificationCodeDigest,
} from "./access-gate";
import { sendLoginVerificationEmail } from "../email/login-verification";

const CHALLENGE_SECONDS = 10 * 60;
const REMEMBER_SECONDS = 400 * 24 * 60 * 60;
const ADMIN_GATE_SECONDS = 12 * 60 * 60;

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
  cookieStore.delete(ADMIN_ENTRY_COOKIE);
}

export async function setAdminEntryVerified(input: {
  userId: string;
  sessionId: string;
}) {
  const token = await signAccessGate({
    kind: "admin-entry",
    userId: input.userId,
    sessionId: input.sessionId,
    expiresAt: Date.now() + ADMIN_GATE_SECONDS * 1000,
  });
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ENTRY_COOKIE, token, cookieOptions(ADMIN_GATE_SECONDS));
}

export function clearAccessGateCookies(cookieStore: {
  delete(name: string): void;
}) {
  cookieStore.delete(USER_CHALLENGE_COOKIE);
  cookieStore.delete(USER_VERIFIED_COOKIE);
  cookieStore.delete(ADMIN_STEP_COOKIE);
  cookieStore.delete(ADMIN_ENTRY_COOKIE);
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
