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

test("Google Forms tutor applications map to private, inactive card drafts", () => {
  const result = parseTutorSpreadsheet([
    [
      "Timestamp",
      "재학중인 대학 (University Currently Enrolled In)",
      "이름 (Name)",
      "학교 이메일 (University Email)",
      "전화번호 (Phone Number)",
      "전공과 학년 (Course and Year)",
      "지원 커리큘럼 (Curricula you can teach)",
      "과목과 성적 (Subjects and your scores)",
      "Languages you teach in 수업 가능 언어",
      "주당 수업 가능 시간 (Hours per week you can teach)",
      "Pick one subject you teach. What do students get wrong most often, and how do you fix it? 가르칠 과목 하나를 골라, 학생들이 가장 많이 틀리는 부분과 그것을 어떻게 잡아 주는지 적어 주세요.",
      "성적 증명서 (Score Report)",
      "재학증명서 Certificate of enrollment (any proof that you are a SKY student)",
      "선배를 어떻게 알게 되셨나요? (How did you hear about Seonbae?)",
      "확인 (Confirm)",
      "수업 과정을 완료하는데 소요되는 시간을 적어주세요.",
      "Email Address",
    ],
    [
      "2026-09-03 10:00",
      "서울대학교 (Seoul National University)",
      "홍길동",
      "student@example.edu",
      "01012345678",
      "수학교육과 2학년",
      "AP, SAT, TOEFL",
      "AP Calculus BC - 5\nSAT - 1570\nTOEFL - 118",
      "Korean 한국어, English 영어",
      "6–10",
      "",
      "https://example.com/private-score-report",
      "https://example.com/private-enrolment-proof",
      "지인 소개",
      "동의합니다",
      "25 sessions",
      "personal@example.com",
    ],
  ], { existingRegistryIds: ["P-010"], maxDisplayOrder: 10 });

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    registry_id: "P-011",
    name: "홍길동",
    exam: "AP, SAT, TOEFL",
    score: "1570",
    category: "ap",
    university: "서울대학교",
    university_en: "Seoul National University",
    photo_url: null,
    banner_url: "/university-snu-banner.png",
    zoom_host_email: null,
    display_order: 11,
    active: false,
    subjectScores: [
      { subject: "AP Calculus BC", score: "5" },
      { subject: "SAT", score: "1570" },
      { subject: "TOEFL", score: "118" },
    ],
    availability: {},
    bio: "전공 및 학년 · 수학교육과 2학년",
    bioEn: null,
    videoUrl: null,
    languages: "Korean 한국어, English 영어",
    lessonFormat: "온라인 1:1 · 주당 6–10시간 가능",
    sourceRow: 2,
  });
  assert.equal("phone" in result.rows[0], false);
  assert.equal("email" in result.rows[0], false);
});

test("aggregate A-Level results become a concise representative score", () => {
  const result = parseTutorSpreadsheet([
    [
      "재학중인 대학 (University Currently Enrolled In)",
      "이름 (Name)",
      "지원 커리큘럼 (Curricula you can teach)",
      "과목과 성적 (Subjects and your scores)",
    ],
    [
      "고려대학교 (Korea University)",
      "테스트 튜터",
      "A-Level",
      "Maths, Further Maths, Computer Science, Physics - 4A*",
    ],
  ]);

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].score, "4A*");
  assert.equal(result.rows[0].category, "alevel");
  assert.equal(result.rows[0].university_en, "Korea University");
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
