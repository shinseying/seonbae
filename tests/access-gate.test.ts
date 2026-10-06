import assert from "node:assert/strict";
import test from "node:test";
import {
  isAdminPhraseValid,
  INVALID_LOGIN_MESSAGE,
  loginMethodMatchesRole,
  peekAccessGatePayload,
  readAccessGate,
  sessionBindingFromClaims,
  signAccessGate,
  verificationCodeDigest,
} from "../utils/auth/access-gate.ts";
import { safeInternalDestination } from "../utils/auth/safe-destination.ts";
import {
  SIGNUP_CONFIRMATION_DESTINATION,
  shouldEstablishSignupVerificationGate,
} from "../utils/auth/callback-verification.ts";

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

test("device trust tokens for several accounts stay separate in one cookie value", async () => {
  const expiresAt = Date.now() + 60_000;
  const student = await signAccessGate({ kind: "device-trust", userId: "student-1", sessionId: "", expiresAt });
  const parent = await signAccessGate({ kind: "device-trust", userId: "parent-1", sessionId: "", expiresAt });
  const cookie = [student, parent].join("~");
  const tokens = cookie.split("~");
  assert.deepEqual(tokens.map((token) => peekAccessGatePayload(token)?.userId), ["student-1", "parent-1"]);
  assert.ok(await readAccessGate(tokens[1], "device-trust", { userId: "parent-1", sessionId: "" }));
  assert.equal(await readAccessGate(tokens[0], "device-trust", { userId: "parent-1", sessionId: "" }), null);
  // Peeking never grants anything: a forged payload still fails verification.
  const forged = `${parent.split(".")[0]}.${student.split(".")[1]}`;
  assert.equal(peekAccessGatePayload(forged)?.userId, "parent-1");
  assert.equal(await readAccessGate(forged, "device-trust", { userId: "parent-1", sessionId: "" }), null);
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

test("internal redirects reject network paths and browser-normalized backslashes", () => {
  assert.equal(safeInternalDestination("/portal/homework?view=open#today"), "/portal/homework?view=open#today");
  assert.equal(safeInternalDestination("//attacker.example"), "/portal");
  assert.equal(safeInternalDestination("/\\attacker.example"), "/portal");
  assert.equal(safeInternalDestination("/%5c%5cattacker.example"), "/portal");
  assert.equal(safeInternalDestination("https://attacker.example"), "/portal");
});

test("only email signup confirmation establishes the user verification gate", () => {
  assert.equal(
    shouldEstablishSignupVerificationGate({
      destination: SIGNUP_CONFIRMATION_DESTINATION,
      provider: null,
    }),
    true,
  );
  assert.equal(
    shouldEstablishSignupVerificationGate({ destination: "/portal", provider: null }),
    false,
  );
  assert.equal(
    shouldEstablishSignupVerificationGate({
      destination: SIGNUP_CONFIRMATION_DESTINATION,
      provider: "google",
    }),
    false,
  );
});
