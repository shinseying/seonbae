export const MAX_TUTOR_SUBJECTS = 10;
export const MAX_TUTOR_CREDENTIAL_FILES = 8;

export const TUTOR_UNIVERSITIES = [
  "서울대학교",
  "고려대학교",
  "연세대학교",
] as const;

export const TUTOR_CURRICULA = [
  "IB",
  "AP",
  "A-Level",
  "IGCSE",
  "SAT",
  "ACT",
  "TOEFL",
  "IELTS",
] as const;

export const TUTOR_LESSON_FORMATS = [
  "온라인 1:1",
  "온라인 소그룹",
  "대면 1:1",
  "온라인·대면 모두",
] as const;

export type TutorSubjectScore = {
  subject: string;
  score: string;
};

export type TutorSignupDetails = {
  university: string;
  majorYear: string;
  curriculum: string;
  languages: string;
  lessonFormat: string;
  subjectScores: TutorSubjectScore[];
  introduction: string;
};

export type TutorSignupErrorCode =
  | "university"
  | "majorYear"
  | "curriculum"
  | "languages"
  | "lessonFormat"
  | "subjectCount"
  | "subjectRows"
  | "introduction"
  | "credentialCount";

const universitySet = new Set<string>(TUTOR_UNIVERSITIES);
const curriculumSet = new Set<string>(TUTOR_CURRICULA);
const lessonFormatSet = new Set<string>(TUTOR_LESSON_FORMATS);

export function tutorSignupDetailsFromForm(form: FormData): TutorSignupDetails {
  const subjects = form.getAll("subjectName");
  const scores = form.getAll("subjectScore");
  const rowCount = Math.max(subjects.length, scores.length);

  return {
    university: formText(form, "university"),
    majorYear: formText(form, "majorYear"),
    curriculum: formText(form, "curriculum"),
    languages: formText(form, "languages"),
    lessonFormat: formText(form, "lessonFormat"),
    subjectScores: Array.from({ length: rowCount }, (_, index) => ({
      subject: entryText(subjects[index]),
      score: entryText(scores[index]),
    })),
    introduction: formText(form, "introduction"),
  };
}

export function validateTutorSignupDetails(details: TutorSignupDetails): TutorSignupErrorCode | null {
  if (!universitySet.has(details.university)) return "university";
  if (details.majorYear.length < 2 || details.majorYear.length > 120) return "majorYear";
  if (!curriculumSet.has(details.curriculum)) return "curriculum";
  if (details.languages.length < 2 || details.languages.length > 80) return "languages";
  if (!lessonFormatSet.has(details.lessonFormat)) return "lessonFormat";
  if (details.subjectScores.length < 1 || details.subjectScores.length > MAX_TUTOR_SUBJECTS) {
    return "subjectCount";
  }
  if (details.subjectScores.some(({ subject, score }) => (
    !subject || subject.length > 80 || !score || score.length > 24
  ))) {
    return "subjectRows";
  }
  if (!details.introduction || details.introduction.length > 2000) return "introduction";
  return null;
}

export function validateTutorCredentialCount(count: number): TutorSignupErrorCode | null {
  return Number.isInteger(count) && count >= 1 && count <= MAX_TUTOR_CREDENTIAL_FILES
    ? null
    : "credentialCount";
}

export function tutorSignupErrorKo(code: TutorSignupErrorCode) {
  const messages: Record<TutorSignupErrorCode, string> = {
    university: "대학교를 선택해 주세요.",
    majorYear: "전공과 학년을 120자 이내로 입력해 주세요.",
    curriculum: "지원할 커리큘럼을 선택해 주세요.",
    languages: "수업 가능 언어를 80자 이내로 입력해 주세요.",
    lessonFormat: "선호하는 수업 형식을 선택해 주세요.",
    subjectCount: `가르칠 과목을 1개 이상 ${MAX_TUTOR_SUBJECTS}개 이하로 입력해 주세요.`,
    subjectRows: "모든 과목의 이름과 성적을 입력해 주세요.",
    introduction: "소개 및 수업 경험을 2,000자 이내로 입력해 주세요.",
    credentialCount: `성적표 또는 자격 증빙을 1개 이상 ${MAX_TUTOR_CREDENTIAL_FILES}개 이하로 첨부해 주세요.`,
  };
  return messages[code];
}

function formText(form: FormData, key: string) {
  return entryText(form.get(key));
}

function entryText(value: FormDataEntryValue | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}
