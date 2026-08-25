const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// A window is written "18:00-21:00". Spaces around the hyphen and a single
// digit hour are accepted and normalised away, because the field is free text
// and "9:00 - 12:00" means the same thing to the person typing it.
const CLOCK = /^(\d{1,2}):([0-5]\d)$/;

// The end may be 24:00: a window that runs to midnight has no other way to say
// so, and 00:00 would read as earlier than the start.
function readTime(value: string, { isEnd }: { isEnd: boolean }) {
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const limit = isEnd ? 24 : 23;
  if (hour > limit) return null;
  if (hour === 24 && match[2] !== "00") return null;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function readRange(raw: string): { range: string } | { error: string } {
  const parts = raw.split("-");
  if (parts.length !== 2) return { error: `가능 시간 형식이 올바르지 않습니다: ${raw}` };
  const from = readTime(parts[0], { isEnd: false });
  const to = readTime(parts[1], { isEnd: true });
  if (!from || !to) return { error: `가능 시간 형식이 올바르지 않습니다: ${raw}` };
  if (from >= to) return { error: `종료 시각이 시작 시각보다 늦어야 합니다: ${raw}` };
  return { range: `${from}-${to}` };
}

/** Shared by the tutor and admin editors. Returns a message string on failure. */
export function parseProfile(body: Record<string, unknown>) {
  const availability: Record<string, string[]> = {};
  const rawAvailability = body.availability;
  if (rawAvailability && typeof rawAvailability === "object") {
    for (const day of DAYS) {
      const ranges = (rawAvailability as Record<string, unknown>)[day];
      if (!Array.isArray(ranges)) continue;
      const clean: string[] = [];
      const typed = ranges
        .filter((range): range is string => typeof range === "string")
        .map((range) => range.trim())
        .filter(Boolean)
        .slice(0, 6);
      for (const range of typed) {
        const result = readRange(range);
        if ("error" in result) return result.error;
        clean.push(result.range);
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
