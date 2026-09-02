import assert from "node:assert/strict";
import test from "node:test";
import { parseTutorSpreadsheet } from "../utils/tutors/excel-import.ts";

test("Korean applicant rows become inactive tutor cards with inferred fields", () => {
  const result = parseTutorSpreadsheet([
    ["튜터 이름", "시험 / 커리큘럼", "검증 성적", "대학교 (한국어)", "과목별 성적", "월 가능 시간"],
    ["김선배", "IB", "43/45", "고려대학교", "IB Math AA HL:7 | IB Physics HL:7", "18:00-21:00, 22:00-24:00"],
  ], { existingRegistryIds: ["P-004"], maxDisplayOrder: 8 });

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].registry_id, "P-005");
  assert.equal(result.rows[0].category, "ib");
  assert.equal(result.rows[0].banner_url, "/university-korea-banner.png");
  assert.equal(result.rows[0].display_order, 9);
  assert.equal(result.rows[0].active, false);
  assert.deepEqual(result.rows[0].availability.mon, ["18:00-21:00", "22:00-24:00"]);
  assert.deepEqual(result.rows[0].subjectScores[1], { subject: "IB Physics HL", score: "7" });
});

test("an existing registry ID is preserved as an update and explicit publication is parsed", () => {
  const result = parseTutorSpreadsheet([
    ["명부 번호", "이름", "커리큘럼", "성적", "분류", "표시 순서", "공개 여부", "대학교 배너"],
    ["p-002", "신승윤", "A-Level", "A*A*A*A*", "A-Level", 2, "공개", "snu"],
  ], { existingRegistryIds: ["P-002"], maxDisplayOrder: 4 });

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].registry_id, "P-002");
  assert.equal(result.rows[0].category, "alevel");
  assert.equal(result.rows[0].active, true);
  assert.equal(result.rows[0].banner_url, "/university-snu-banner.png");
});

test("course names infer IB and AP categories without a separate category column", () => {
  const result = parseTutorSpreadsheet([
    ["이름", "시험", "성적"],
    ["김선배", "IB Physics HL", "7"],
    ["이후배", "AP Calculus BC", "5"],
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map((row) => row.category), ["ib", "ap"]);
});

test("missing required columns and duplicate IDs block the import", () => {
  const missing = parseTutorSpreadsheet([["이름"], ["김선배"]]);
  assert.equal(missing.rows.length, 0);
  assert.equal(missing.errors.length, 2);

  const duplicate = parseTutorSpreadsheet([
    ["명부 번호", "이름", "시험", "성적"],
    ["P-010", "김선배", "SAT", "1510"],
    ["P-010", "이후배", "SAT", "1540"],
  ]);
  assert.equal(duplicate.rows.length, 1);
  assert.match(duplicate.errors[0].message, /중복/);
});

test("unsafe URLs and malformed time ranges are reported before upload", () => {
  const result = parseTutorSpreadsheet([
    ["이름", "시험", "성적", "사진 URL", "화 가능 시간"],
    ["김선배", "IELTS", "8.0", "http://example.com/photo.jpg", "21:00-18:00"],
  ]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.some((error) => error.field === "사진 URL"));
  assert.ok(result.errors.some((error) => error.field === "tue 가능 시간"));
});
