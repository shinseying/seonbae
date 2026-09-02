import assert from "node:assert/strict";
import test from "node:test";
import { portalDestinationForState } from "../utils/auth/portal-state.ts";

const profile = (role: string, account_status: string) => ({ role, account_status });

test("approved unsigned tutors go to the contract", () => {
  assert.equal(portalDestinationForState(profile("tutor", "approved"), false), "/portal/tutor/contract");
});

test("approved signed tutors go to the tutor portal", () => {
  assert.equal(portalDestinationForState(profile("tutor", "approved"), true), "/portal/tutor");
});

test("pending unsigned tutors sign before returning to admissions", () => {
  assert.equal(portalDestinationForState(profile("tutor", "pending"), false), "/portal/tutor/contract");
  assert.equal(portalDestinationForState(profile("tutor", "pending"), true), "/portal/pending");
});

test("rejected tutors never reach a contract or portal", () => {
  assert.equal(portalDestinationForState(profile("tutor", "rejected"), false), "/portal/pending");
  assert.equal(portalDestinationForState(profile("tutor", "rejected"), true), "/portal/pending");
});

test("non-tutor and admin destinations remain unchanged", () => {
  assert.equal(portalDestinationForState(profile("student", "approved")), "/portal");
  assert.equal(portalDestinationForState(profile("parent", "pending")), "/portal/pending");
  assert.equal(portalDestinationForState(profile("admin", "approved")), "/admin");
  assert.equal(portalDestinationForState(null), "/portal/pending");
});
