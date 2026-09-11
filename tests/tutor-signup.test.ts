import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TUTOR_CREDENTIAL_FILES,
  MAX_TUTOR_SUBJECTS,
  tutorSignupDetailsFromForm,
  validateTutorCredentialCount,
  validateTutorSignupDetails,
  type TutorSignupDetails,
} from "../utils/auth/tutor-signup.ts";

const validDetails = (): TutorSignupDetails => ({
  university: "서울대학교",
  majorYear: "경제학부 2학년",
  curriculum: "IB",
  languages: "한국어, 영어",
  lessonFormat: "온라인 1:1",
  subjectScores: [
    { subject: "IB Economics HL", score: "7" },
    { subject: "IB Mathematics AA SL", score: "7" },
  ],
  introduction: "학생이 막히는 지점을 진단하고 풀이 과정을 설명합니다.",
});

test("tutor signup parses legacy application fields and repeating subject results", () => {
  const form = new FormData();
  form.set("university", " 서울대학교 ");
  form.set("majorYear", " 경제학부 2학년 ");
  form.set("curriculum", "IB");
  form.set("languages", "한국어, 영어");
  form.set("lessonFormat", "온라인 1:1");
  form.append("subjectName", " IB Economics HL ");
  form.append("subjectScore", " 7 ");
  form.append("subjectName", "IB Mathematics AA SL");
  form.append("subjectScore", "7");
  form.set("introduction", " 수업 경험 ");

  assert.deepEqual(tutorSignupDetailsFromForm(form), {
    ...validDetails(),
    introduction: "수업 경험",
  });
});

test("tutor signup requires every restored application detail", () => {
  const cases: Array<[keyof TutorSignupDetails, unknown, string]> = [
    ["university", "", "university"],
    ["majorYear", "", "majorYear"],
    ["curriculum", "", "curriculum"],
    ["languages", "", "languages"],
    ["lessonFormat", "", "lessonFormat"],
    ["subjectScores", [], "subjectCount"],
    ["introduction", "", "introduction"],
  ];

  for (const [key, value, expected] of cases) {
    assert.equal(validateTutorSignupDetails({ ...validDetails(), [key]: value }), expected);
  }
});

test("subject rows stay paired and bounded", () => {
  assert.equal(
    validateTutorSignupDetails({
      ...validDetails(),
      subjectScores: [{ subject: "IB Economics HL", score: "" }],
    }),
    "subjectRows",
  );
  assert.equal(
    validateTutorSignupDetails({
      ...validDetails(),
      subjectScores: Array.from({ length: MAX_TUTOR_SUBJECTS + 1 }, () => ({ subject: "IB", score: "7" })),
    }),
    "subjectCount",
  );
});

test("credential upload accepts one through eight files only", () => {
  assert.equal(validateTutorCredentialCount(0), "credentialCount");
  assert.equal(validateTutorCredentialCount(1), null);
  assert.equal(validateTutorCredentialCount(MAX_TUTOR_CREDENTIAL_FILES), null);
  assert.equal(validateTutorCredentialCount(MAX_TUTOR_CREDENTIAL_FILES + 1), "credentialCount");
});
