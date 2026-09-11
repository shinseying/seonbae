import assert from "node:assert/strict";
import test from "node:test";
import { buildTutorRow } from "../utils/tutors/admin-card.ts";
import { createTutorRegistryId } from "../utils/tutors/registry-id.ts";
import { tutorPhotoUploadError } from "../utils/files/image-upload.ts";
import { createTutorPhotoDraftTracker } from "../utils/tutors/photo-draft-tracker.ts";

const baseCard = {
  name: "김선배",
  exam: "IB Diploma",
  score: "",
  category: "ib",
  display_order: 1,
  active: false,
};

test("structured subject results save without the redundant representative score", () => {
  const result = buildTutorRow({
    ...baseCard,
    subjectScores: [{ subject: "IB Mathematics AA HL", score: "7" }],
  });
  assert.equal(typeof result, "object");
  if (typeof result === "string") return;
  assert.equal(result.score, "");
  assert.deepEqual(result.subject_scores, [{ subject: "IB Mathematics AA HL", score: "7" }]);
});

test("a card requires one complete subject result", () => {
  assert.match(String(buildTutorRow({ ...baseCard, subjectScores: [] })), /과목별 성적/);
  assert.match(String(buildTutorRow({
    ...baseCard,
    subjectScores: [{ subject: "IB Physics HL", score: "" }],
  })), /과목과 성적/);
  assert.match(String(buildTutorRow({
    ...baseCard,
    subjectScores: Array.from({ length: 13 }, (_, index) => ({ subject: `Subject ${index}`, score: "7" })),
  })), /최대 12개/);
});

test("new internal tutor keys use one format", () => {
  assert.equal(createTutorRegistryId("bdc7e578-0000-0000-0000-000000000000"), "T-BDC7E578");
  assert.match(createTutorRegistryId(), /^T-[A-F0-9]{8}$/);
});

test("profile-photo validation checks the real image signature", async () => {
  const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "portrait.jpg", { type: "image/jpeg" });
  const disguised = new File([new TextEncoder().encode("not an image")], "portrait.jpg", { type: "image/jpeg" });
  assert.equal(await tutorPhotoUploadError(jpeg), null);
  assert.match(String(await tutorPhotoUploadError(disguised)), /실제 형식/);
  const oversized = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "portrait.png", { type: "image/png" });
  assert.match(String(await tutorPhotoUploadError(oversized)), /4MB 이하/);
});

test("photo drafts clean replacements and abandonment but preserve committed uploads", () => {
  const tracker = createTutorPhotoDraftTracker();
  assert.deepEqual(tracker.replace("T-ONE", "profiles/one.webp"), []);
  assert.deepEqual(tracker.replace("T-ONE", "profiles/two.webp"), ["profiles/one.webp"]);
  assert.deepEqual(tracker.commit("T-ONE", "profiles/two.webp"), []);

  assert.deepEqual(tracker.replace("T-TWO", "profiles/three.webp"), []);
  assert.deepEqual(tracker.abandon("T-TWO"), ["profiles/three.webp"]);
  assert.deepEqual(tracker.abandon("T-TWO"), []);

  tracker.replace("T-THREE", "profiles/four.webp");
  tracker.replace("T-FOUR", "profiles/five.webp");
  assert.deepEqual(tracker.abandonAll().sort(), ["profiles/five.webp", "profiles/four.webp"]);
  assert.deepEqual(tracker.abandonAll(), []);
});
