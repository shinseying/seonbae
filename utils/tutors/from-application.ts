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

// `exam` and `score` are NOT NULL on public.tutors, so an application without
// those answers writes an empty string rather than a placeholder label.
export function registryRowFromApplication(
  registryId: string,
  application: TutorApplicationRow,
) {
  const subjects = (application.subjects || "")
    .split(",")
    .map((subject) => subject.trim())
    .filter(Boolean)
    .map((subject) => ({ subject, score: "" }));

  return {
    registry_id: registryId,
    name: application.full_name,
    exam: (application.curriculum || "").trim(),
    score: (application.official_score || "").trim(),
    category: tutorCategoryFor(application.curriculum),
    tier: "standard",
    university: application.university?.trim() || null,
    bio: application.introduction?.trim() || null,
    subject_scores: subjects,
    zoom_host_email: application.email,
    active: false,
    updated_at: new Date().toISOString(),
  };
}
