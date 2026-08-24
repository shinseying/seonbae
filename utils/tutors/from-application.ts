import "server-only";

// The registry row a tutor application becomes. Everything the applicant typed
// lands on the card immediately, so an admin opening the roster sees real
// details instead of review placeholders.
export type TutorApplicationRow = {
  full_name: string;
  email: string;
  university?: string | null;
  subjects?: string | null;
  curriculum?: string | null;
  official_score?: string | null;
  introduction?: string | null;
  languages?: string | null;
  lesson_format?: string | null;
  subject_scores?: unknown;
};

const CATEGORY_BY_CURRICULUM: Record<string, string> = {
  ib: "ib",
  ap: "ap",
  "a-level": "alevel",
  alevel: "alevel",
  igcse: "alevel",
  sat: "sat",
  act: "sat",
  toefl: "english",
  ielts: "english",
};

export function tutorCategoryFor(curriculum?: string | null) {
  const key = (curriculum || "").trim().toLowerCase();
  return CATEGORY_BY_CURRICULUM[key] || "english";
}

// The application stores a proof path beside each score. The public card only
// needs the subject and the score, so the proof stays out of the registry.
function cardScores(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => ({
      subject: typeof (row as { subject?: unknown })?.subject === "string"
        ? ((row as { subject: string }).subject).trim()
        : "",
      score: typeof (row as { score?: unknown })?.score === "string"
        ? ((row as { score: string }).score).trim()
        : "",
    }))
    .filter((row) => row.subject && row.score);
}

// `exam` and `score` are NOT NULL on public.tutors, so an application without
// those answers writes an empty string rather than a placeholder label.
export function registryRowFromApplication(
  registryId: string,
  application: TutorApplicationRow,
) {
  const scores = cardScores(application.subject_scores);
  // Older applications carried a single overall score instead of per-subject
  // ones, so fall back to it rather than showing an empty badge.
  const fallbackScore = (application.official_score || "").trim();

  return {
    registry_id: registryId,
    name: application.full_name,
    exam: (application.curriculum || "").trim(),
    score: scores.length ? "" : fallbackScore,
    category: tutorCategoryFor(application.curriculum),
    university: application.university?.trim() || null,
    bio: application.introduction?.trim() || null,
    subject_scores: scores,
    languages: application.languages?.trim() || null,
    lesson_format: application.lesson_format?.trim() || null,
    zoom_host_email: application.email,
    active: false,
    updated_at: new Date().toISOString(),
  };
}
