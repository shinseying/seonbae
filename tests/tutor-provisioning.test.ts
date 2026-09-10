import assert from "node:assert/strict";
import test from "node:test";
import { parseTutorCardChoice } from "../utils/tutors/provisioning.ts";

test("tutor provisioning requires an explicit card choice", () => {
  assert.equal(parseTutorCardChoice(undefined, undefined), null);
  assert.equal(parseTutorCardChoice("link", ""), null);
  assert.equal(parseTutorCardChoice("replace", "T-001"), null);
});

test("new cards and existing links are parsed without ambiguity", () => {
  assert.deepEqual(parseTutorCardChoice("create", "T-IGNORED"), {
    mode: "create",
    registryId: null,
  });
  assert.deepEqual(parseTutorCardChoice("link", "  T-001  "), {
    mode: "link",
    registryId: "T-001",
  });
});
