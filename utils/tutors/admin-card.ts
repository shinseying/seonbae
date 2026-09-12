import { parseProfile } from "./profile-patch.ts";

export const TUTOR_FIELDS =
  "registry_id,roster_number,name,exam,score,category,categories,university,university_en,photo_url,photo_path,banner_url,zoom_host_email,display_order,active,subject_scores,availability,bio,bio_en,video_url,languages";

const ALLOWED_CATEGORIES = new Set(["ib", "ap", "alevel", "sat", "english"]);

/** One tutor often teaches SAT and IB and AP, so the card carries a set. The
 *  first entry stays in `category` for readers that predate the array. */
export function normalizeCategories(value: unknown, fallback?: unknown) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const key = cleanText(entry, 20);
    if (ALLOWED_CATEGORIES.has(key)) seen.add(key);
  }
  if (!seen.size) {
    const single = cleanText(fallback, 20);
    if (ALLOWED_CATEGORIES.has(single)) seen.add(single);
  }
  return [...seen];
}

/** Validates and normalises the public card columns shared by single and Excel imports. */
export function buildTutorRow(body: Record<string, unknown>) {
  const categories = normalizeCategories(body.categories, body.category);
  if (!categories.length) return "분류를 하나 이상 선택해 주세요.";
  const category = categories[0];

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
  });
  if (typeof profilePatch === "string") return profilePatch;

  const rawScores = body.subjectScores ?? body.subject_scores;
  if (Array.isArray(rawScores)) {
    const incomplete = rawScores.some((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return Boolean(String(row.subject ?? "").trim()) !== Boolean(String(row.score ?? "").trim());
    });
    if (incomplete) return "과목별 성적은 과목과 성적을 모두 입력해 주세요.";
  }

  const row = {
    ...profilePatch,
    name: cleanText(body.name, 80),
    exam: cleanText(body.exam, 80),
    score: cleanText(body.score, 80),
    category,
    categories,
    university: nullableText(body.university, 120),
    university_en: nullableText(body.university_en, 160),
    photo_url: safeAssetUrl(body.photo_url),
    photo_path: safePhotoPath(body.photo_path),
    banner_url: safeAssetUrl(body.banner_url),
    zoom_host_email: zoomHostEmail || null,
    display_order: displayOrder,
    active: body.active === true,
    updated_at: new Date().toISOString(),
  };

  if (!row.name || !row.exam) return "튜터 이름과 커리큘럼을 입력해 주세요.";
  if (!row.subject_scores.length) return "과목별 성적을 한 개 이상 입력해 주세요.";
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

export function isManagedTutorPhotoPath(value: unknown): value is string {
  const text = cleanText(value, 160);
  return /^profiles\/[a-f0-9-]+\.(?:jpg|png|webp)$/i.test(text);
}

function safePhotoPath(value: unknown) {
  const text = cleanText(value, 160);
  return isManagedTutorPhotoPath(text) ? text : null;
}
