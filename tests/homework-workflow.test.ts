import test from "node:test";
import assert from "node:assert/strict";
import {
  canReplaceSubmission,
  canTurnIn,
  canUndoTurnIn,
  homeworkGroup,
} from "../utils/homework/workflow.ts";

test("assignment states map to the three student-facing queues", () => {
  assert.equal(homeworkGroup("todo"), "assigned");
  assert.equal(homeworkGroup("needs_revision"), "assigned");
  assert.equal(homeworkGroup("submitted"), "submitted");
  assert.equal(homeworkGroup("graded"), "returned");
});

test("turn-in actions are limited to appropriate states", () => {
  assert.equal(canTurnIn("todo"), true);
  assert.equal(canTurnIn("needs_revision"), true);
  assert.equal(canTurnIn("submitted"), false);
  assert.equal(canUndoTurnIn("submitted"), true);
  assert.equal(canReplaceSubmission("submitted"), true);
  assert.equal(canReplaceSubmission("graded"), false);
  assert.equal(canReplaceSubmission("todo"), false);
  assert.equal(canUndoTurnIn("graded"), false);
});
