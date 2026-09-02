import { parseProfile } from "./profile-patch";

export const TUTOR_FIELDS =
  "registry_id,name,exam,score,category,university,university_en,photo_url,banner_url,zoom_host_email,display_order,active,subject_scores,availability,bio,bio_en,video_url,languages,lesson_format";

const ALLOWED_CATEGORIES = new Set(["ib", "ap", "alevel", "sat", "english"]);

/** Validates and normalises the public card columns shared by single and Excel imports. */
export function buildTutorRow(body: Record<string, unknown>) {
  const category = cleanText(body.category, 20);
  if (!ALLOWED_CATEGORIES.has(category)) return "분류 값이 올바르지 않습니다.";

  const displayOrder = Number(body.display_order);
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
    return "표시 순서는 0~9999 사이의 정수여야 합니다.";
  }

  const zoomHostEmail = cleanText(body.zoom_host_email, 254).toLowerCase();
  if (zoomHostEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(zoomHostEmail)) {
    return "Zoom 호스트 이메일 형식을 확인해 주세요.";
  }

  const profilePatch = parseProfile({
    ...body,
    subjectScores: body.subjectScores ?? body.subject_scores,
    bioEn: body.bioEn ?? body.bio_en,
    videoUrl: body.videoUrl ?? body.video_url,
    lessonFormat: body.lessonFormat ?? body.lesson_format,
  });
  if (typeof profilePatch === "string") return profilePatch;

  const row = {
    ...profilePatch,
    name: cleanText(body.name, 80),
    exam: cleanText(body.exam, 80),
    score: cleanText(body.score, 80),
    category,
    university: nullableText(body.university, 120),
    university_en: nullableText(body.university_en, 160),
    photo_url: safeAssetUrl(body.photo_url),
    banner_url: safeAssetUrl(body.banner_url),
    zoom_host_email: zoomHostEmail || null,
    display_order: displayOrder,
    active: body.active === true,
    updated_at: new Date().toISOString(),
  };

  if (!row.name || !row.exam || !row.score) return "이름, 시험, 성적을 모두 입력해 주세요.";
  return row;
}

export function normalizeRegistryId(value: unknown) {
  return cleanText(value, 24).toUpperCase();
}

export function isValidRegistryId(value: string) {
  return /^[A-Z][A-Z0-9-]{1,23}$/.test(value);
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const text = cleanText(value, maxLength);
  return text || null;
}

function safeAssetUrl(value: unknown) {
  const text = cleanText(value, 500);
  if (!text) return null;
  if (text.startsWith("/")) return text;

  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
