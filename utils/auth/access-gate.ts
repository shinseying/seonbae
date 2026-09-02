export const USER_CHALLENGE_COOKIE = "seonbae-user-challenge";
export const USER_VERIFIED_COOKIE = "seonbae-user-verified";
export const ADMIN_STEP_COOKIE = "seonbae-admin-step";
export const ADMIN_ENTRY_COOKIE = "seonbae-admin-entry";
export const ADMIN_AUTH_EMAIL = "ssapgoadmin@seonbae.internal";
export const INVALID_LOGIN_MESSAGE = "입력한 로그인 정보가 일치하지 않습니다.";

export type AccessGateKind =
  | "user-challenge"
  | "user-verified"
  | "admin-step"
  | "admin-entry";

export type AccessGatePayload = {
  kind: AccessGateKind;
  userId: string;
  sessionId: string;
  expiresAt: number;
  codeDigest?: string;
  attempts?: number;
  remember?: boolean;
};

export function loginMethodMatchesRole(
  isAdminLogin: boolean,
  role: string | null | undefined,
) {
  return isAdminLogin ? role === "admin" : role !== "admin";
}

const ADMIN_PHRASE_SHA256 =
  "948db6f592edafc28bd69788a618f07b0e1fb53f972cfcc1a8f6ea00ab5006ea";

export async function signAccessGate(payload: AccessGatePayload) {
  const encoded = encodeText(JSON.stringify(payload));
  const signature = await sign(encoded);
  return `${encoded}.${encodeBytes(signature)}`;
}

export async function readAccessGate(
  token: string | undefined,
  kind: AccessGateKind,
  identity: { userId: string; sessionId: string },
) {
  if (!token) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;

  try {
    const key = await signingKey(["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBytes(signature),
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;

    const payload = JSON.parse(decodeText(encoded)) as AccessGatePayload;
    if (
      payload.kind !== kind
      || payload.userId !== identity.userId
      || payload.sessionId !== identity.sessionId
      || !Number.isFinite(payload.expiresAt)
      || payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function verificationCodeDigest(input: {
  code: string;
  userId: string;
  sessionId: string;
  expiresAt: number;
}) {
  const value = [input.userId, input.sessionId, input.expiresAt, input.code].join("|");
  return encodeBytes(await sign(value));
}

export async function isAdminPhraseValid(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim())),
  );
  const expected = hexToBytes(ADMIN_PHRASE_SHA256);
  if (digest.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < digest.length; index += 1) {
    difference |= digest[index] ^ expected[index];
  }
  return difference === 0;
}

export function createVerificationCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

export function claimsIdentity(claims: Record<string, unknown> | null | undefined) {
  const userId = typeof claims?.sub === "string" ? claims.sub : "";
  const sessionId = sessionBindingFromClaims(claims);
  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : "";
  return { userId, sessionId, email };
}

export function sessionBindingFromClaims(
  claims: Record<string, unknown> | null | undefined,
) {
  if (typeof claims?.session_id === "string" && claims.session_id) {
    return claims.session_id;
  }
  const subject = typeof claims?.sub === "string" ? claims.sub : "";
  const issuedAt = typeof claims?.iat === "number" ? String(claims.iat) : "";
  return subject && issuedAt ? `${subject}:${issuedAt}` : "";
}

export function decodeJwtClaims(accessToken: string | null | undefined) {
  if (!accessToken) return null;
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(decodeText(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function accessGateSecret() {
  const secret =
    process.env.AUTH_STEP_UP_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Step-up authentication secret is not configured.");
  return secret;
}

async function signingKey(usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(accessGateSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

async function sign(value: string) {
  const key = await signingKey(["sign"]);
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

function encodeText(value: string) {
  return encodeBytes(new TextEncoder().encode(value));
}

function decodeText(value: string) {
  return new TextDecoder().decode(decodeBytes(value));
}

function encodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hexToBytes(value: string) {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}
