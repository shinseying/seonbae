const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const RANGE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

/** Shared by the tutor and admin editors. Returns a message string on failure. */
export function parseProfile(body: Record<string, unknown>) {
  const availability: Record<string, string[]> = {};
  const rawAvailability = body.availability;
  if (rawAvailability && typeof rawAvailability === "object") {
    for (const day of DAYS) {
      const ranges = (rawAvailability as Record<string, unknown>)[day];
      if (!Array.isArray(ranges)) continue;
      const clean = ranges
        .filter((range): range is string => typeof range === "string")
        .map((range) => range.trim())
        .filter(Boolean)
        .slice(0, 6);
      for (const range of clean) {
        if (!RANGE.test(range)) return `가능 시간 형식이 올바르지 않습니다: ${range}`;
        const [from, to] = range.split("-");
        if (from >= to) return `시작 시각이 종료 시각보다 빠릅니다: ${range}`;
      }
      if (clean.length) availability[day] = clean;
    }
  }

  const scores: Array<{ subject: string; score: string }> = [];
  if (Array.isArray(body.subjectScores)) {
    for (const row of body.subjectScores.slice(0, 12)) {
      if (!row || typeof row !== "object") continue;
      const subject = String((row as Record<string, unknown>).subject ?? "").trim().slice(0, 80);
      const score = String((row as Record<string, unknown>).score ?? "").trim().slice(0, 24);
      if (subject && score) scores.push({ subject, score });
    }
  }

  const video = String(body.videoUrl ?? "").trim().slice(0, 400);
  if (video && !/^https:\/\//.test(video)) return "영상 주소는 https:// 로 시작해야 합니다.";

  return {
    availability,
    subject_scores: scores,
    bio: nullable(body.bio, 600),
    bio_en: nullable(body.bioEn, 600),
    video_url: video || null,
    languages: nullable(body.languages, 80),
    lesson_format: nullable(body.lessonFormat, 80),
  };
}

function nullable(value: unknown, max: number) {
  const text = String(value ?? "").trim().slice(0, max);
  return text || null;
}
