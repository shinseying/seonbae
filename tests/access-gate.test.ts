import assert from "node:assert/strict";
import test from "node:test";
import {
  isAdminPhraseValid,
  INVALID_LOGIN_MESSAGE,
  loginMethodMatchesRole,
  readAccessGate,
  sessionBindingFromClaims,
  signAccessGate,
  verificationCodeDigest,
} from "../utils/auth/access-gate.ts";

process.env.AUTH_STEP_UP_SECRET = "test-only-step-up-secret-with-enough-entropy";

const identity = { userId: "user-123", sessionId: "session-456" };

test("a signed user verification gate is bound to its user and session", async () => {
  const token = await signAccessGate({
    kind: "user-verified",
    ...identity,
    expiresAt: Date.now() + 60_000,
  });
  assert.ok(await readAccessGate(token, "user-verified", identity));
  assert.equal(
    await readAccessGate(token, "user-verified", { ...identity, sessionId: "other-session" }),
    null,
  );
});

test("tampered and expired gates are rejected", async () => {
  const token = await signAccessGate({
    kind: "admin-step",
    ...identity,
    expiresAt: Date.now() + 60_000,
  });
  assert.equal(await readAccessGate(`${token}x`, "admin-step", identity), null);

  const expired = await signAccessGate({
    kind: "admin-step",
    ...identity,
    expiresAt: Date.now() - 1,
  });
  assert.equal(await readAccessGate(expired, "admin-step", identity), null);
});

test("verification codes are bound to expiry and session", async () => {
  const expiresAt = Date.now() + 60_000;
  const first = await verificationCodeDigest({ code: "123456", expiresAt, ...identity });
  const same = await verificationCodeDigest({ code: "123456", expiresAt, ...identity });
  const other = await verificationCodeDigest({ code: "123456", expiresAt, ...identity, sessionId: "other" });
  assert.equal(first, same);
  assert.notEqual(first, other);
});

test("an incorrect admin phrase is rejected", async () => {
  assert.equal(await isAdminPhraseValid("not-the-admin-phrase"), false);
});

test("session binding prefers the Supabase session id", () => {
  assert.equal(sessionBindingFromClaims({ sub: "user", iat: 10, session_id: "sid" }), "sid");
  assert.equal(sessionBindingFromClaims({ sub: "user", iat: 10 }), "user:10");
});

test("password login does not disclose administrator accounts", () => {
  assert.equal(loginMethodMatchesRole(true, "admin"), true);
  assert.equal(loginMethodMatchesRole(true, "student"), false);
  assert.equal(loginMethodMatchesRole(false, "student"), true);
  assert.equal(loginMethodMatchesRole(false, "admin"), false);
  assert.doesNotMatch(INVALID_LOGIN_MESSAGE, /관리자|admin|아이디/i);
});
