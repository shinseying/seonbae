export type TutorImportCategory = "ib" | "ap" | "alevel" | "sat" | "english";

export type TutorImportRow = {
  registry_id: string;
  name: string;
  exam: string;
  score: string;
  category: TutorImportCategory;
  university: string | null;
  university_en: string | null;
  photo_url: string | null;
  banner_url: string | null;
  zoom_host_email: string | null;
  display_order: number;
  active: boolean;
  subjectScores: Array<{ subject: string; score: string }>;
  availability: Record<string, string[]>;
  bio: string | null;
  bioEn: string | null;
  videoUrl: string | null;
  languages: string | null;
  lessonFormat: string | null;
  sourceRow: number;
};

export type TutorImportError = {
  row: number;
  field?: string;
  message: string;
};

export type TutorImportResult = {
  rows: TutorImportRow[];
  errors: TutorImportError[];
};

type ColumnKey =
  | "registry_id" | "name" | "exam" | "score" | "category" | "display_order" | "active"
  | "university" | "university_en" | "banner_url" | "photo_url" | "zoom_host_email"
  | "subject_scores" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
  | "bio" | "bio_en" | "video_url" | "languages" | "lesson_format";

const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  registry_id: ["명부번호", "튜터번호", "카드번호", "registryid", "registry", "cardid"],
  name: ["튜터이름", "이름", "성명", "지원자이름", "name", "tutorname"],
  exam: ["시험커리큘럼", "시험", "커리큘럼", "교육과정", "exam", "curriculum"],
  score: ["검증성적", "성적", "대표성적", "score", "verifiedscore"],
  category: ["카테고리", "분류", "category"],
  display_order: ["표시순서", "순서", "displayorder", "order"],
  active: ["공개여부", "공개", "활성", "active", "published"],
  university: ["대학교한국어", "대학교", "학교", "소속학교", "universitykr", "university"],
  university_en: ["대학교영문", "학교영문", "universityen"],
  banner_url: ["대학교배너", "배너", "배너url", "banner", "bannerurl"],
  photo_url: ["사진url", "튜터사진url", "프로필사진", "photo", "photourl"],
  zoom_host_email: ["zoom호스트이메일", "줌호스트이메일", "zoomemail", "zoomhostemail"],
  subject_scores: ["과목별성적", "세부성적", "subjectscores", "subjects"],
  mon: ["월가능시간", "월요일가능시간", "monday", "mon"],
  tue: ["화가능시간", "화요일가능시간", "tuesday", "tue"],
  wed: ["수가능시간", "수요일가능시간", "wednesday", "wed"],
  thu: ["목가능시간", "목요일가능시간", "thursday", "thu"],
  fri: ["금가능시간", "금요일가능시간", "friday", "fri"],
  sat: ["토가능시간", "토요일가능시간", "saturday", "sat"],
  sun: ["일가능시간", "일요일가능시간", "sunday", "sun"],
  bio: ["소개한국어", "한국어소개", "소개", "biokr", "bio"],
  bio_en: ["소개영어", "소개영문", "영어소개", "bioen"],
  video_url: ["샘플수업영상url", "영상url", "video", "videourl"],
  languages: ["언어", "가능언어", "languages", "language"],
  lesson_format: ["수업형식", "수업방식", "lessonformat", "format"],
};

const REQUIRED_COLUMNS: Array<{ key: ColumnKey; label: string }> = [
  { key: "name", label: "튜터 이름" },
  { key: "exam", label: "시험 / 커리큘럼" },
  { key: "score", label: "검증 성적" },
];

export function parseTutorSpreadsheet(
  sheet: unknown[][],
  options: { existingRegistryIds?: string[]; maxDisplayOrder?: number } = {},
): TutorImportResult {
  const errors: TutorImportError[] = [];
  if (!Array.isArray(sheet) || sheet.length === 0) {
    return { rows: [], errors: [{ row: 1, message: "엑셀 파일에 데이터가 없습니다." }] };
  }

  const columns = findColumns(sheet[0]);
  for (const required of REQUIRED_COLUMNS) {
    if (columns[required.key] === undefined) {
      errors.push({ row: 1, field: required.label, message: `필수 열 ‘${required.label}’을 찾지 못했습니다.` });
    }
  }
  if (errors.length) return { rows: [], errors };

  const dataRows = sheet.slice(1).filter((row) => Array.isArray(row) && row.some((cell) => cellText(cell) !== ""));
  if (dataRows.length === 0) {
    return { rows: [], errors: [{ row: 2, message: "헤더 아래에 튜터 정보를 한 명 이상 입력해 주세요." }] };
  }
  if (dataRows.length > 100) {
    errors.push({ row: 102, message: "한 번에 최대 100명까지 가져올 수 있습니다." });
  }

  const existing = new Set((options.existingRegistryIds ?? []).map((value) => value.trim().toUpperCase()));
  const reserved = new Set(existing);
  for (const row of dataRows) {
    const explicit = read(row, columns.registry_id).toUpperCase();
    if (explicit) reserved.add(explicit);
  }
  let nextIdNumber = Math.max(0, ...[...reserved].map((value) => Number(/^P-(\d+)$/.exec(value)?.[1] ?? 0))) + 1;
  let nextOrder = Math.max(0, Number(options.maxDisplayOrder) || 0) + 1;
  const seenInFile = new Set<string>();
  const parsed: TutorImportRow[] = [];

  dataRows.slice(0, 100).forEach((row, dataIndex) => {
    const sourceRow = sheet.indexOf(row) + 1;
    const rowErrors: TutorImportError[] = [];
    let registryId = read(row, columns.registry_id).toUpperCase();
    if (!registryId) {
      do {
        registryId = `P-${String(nextIdNumber).padStart(3, "0")}`;
        nextIdNumber += 1;
      } while (reserved.has(registryId) || seenInFile.has(registryId));
    }
    if (!/^[A-Z][A-Z0-9-]{1,23}$/.test(registryId)) {
      rowErrors.push({ row: sourceRow, field: "명부 번호", message: "영문 대문자로 시작하고 영문·숫자·하이픈만 사용해 주세요." });
    }
    if (seenInFile.has(registryId)) {
      rowErrors.push({ row: sourceRow, field: "명부 번호", message: `${registryId}가 파일 안에서 중복되었습니다.` });
    }
    seenInFile.add(registryId);

    const name = requiredText(row, columns.name, sourceRow, "튜터 이름", 80, rowErrors);
    const exam = requiredText(row, columns.exam, sourceRow, "시험 / 커리큘럼", 80, rowErrors);
    const score = requiredText(row, columns.score, sourceRow, "검증 성적", 80, rowErrors);
    const category = parseCategory(read(row, columns.category), exam);
    if (!category) {
      rowErrors.push({ row: sourceRow, field: "카테고리", message: "IB, AP, A-Level, SAT, 영어 시험 중 하나를 입력해 주세요." });
    }

    const orderText = read(row, columns.display_order);
    const displayOrder = orderText ? Number(orderText) : nextOrder++;
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
      rowErrors.push({ row: sourceRow, field: "표시 순서", message: "0~9999 사이의 정수를 입력해 주세요." });
    }

    const activeResult = parseActive(read(row, columns.active));
    if (typeof activeResult === "string") {
      rowErrors.push({ row: sourceRow, field: "공개 여부", message: activeResult });
    }

    const university = optionalText(row, columns.university, sourceRow, "대학교 (한국어)", 120, rowErrors);
    const universityEn = optionalText(row, columns.university_en, sourceRow, "대학교 (영문)", 160, rowErrors);
    const photoUrl = parseAssetUrl(read(row, columns.photo_url), sourceRow, "사진 URL", rowErrors);
    const bannerUrl = parseBanner(read(row, columns.banner_url), university, universityEn, sourceRow, rowErrors);
    const zoomEmail = read(row, columns.zoom_host_email).toLowerCase();
    if (zoomEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(zoomEmail)) {
      rowErrors.push({ row: sourceRow, field: "Zoom 호스트 이메일", message: "이메일 형식을 확인해 주세요." });
    }

    const subjectScores = parseSubjectScores(read(row, columns.subject_scores), sourceRow, rowErrors);
    const availability: Record<string, string[]> = {};
    for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const) {
      const ranges = parseAvailability(read(row, columns[day]), sourceRow, day, rowErrors);
      if (ranges.length) availability[day] = ranges;
    }

    const bio = optionalText(row, columns.bio, sourceRow, "소개 (한국어)", 600, rowErrors);
    const bioEn = optionalText(row, columns.bio_en, sourceRow, "소개 (영어)", 600, rowErrors);
    const videoUrl = read(row, columns.video_url);
    if (videoUrl && (!isSafeUrl(videoUrl) || !videoUrl.startsWith("https://"))) {
      rowErrors.push({ row: sourceRow, field: "샘플 수업 영상 URL", message: "https://로 시작하는 주소를 입력해 주세요." });
    }

    const languages = optionalText(row, columns.languages, sourceRow, "언어", 80, rowErrors);
    const lessonFormat = optionalText(row, columns.lesson_format, sourceRow, "수업 형식", 80, rowErrors);
    errors.push(...rowErrors);
    if (rowErrors.length || !category || typeof activeResult === "string") return;

    parsed.push({
      registry_id: registryId,
      name,
      exam,
      score,
      category,
      university,
      university_en: universityEn,
      photo_url: photoUrl,
      banner_url: bannerUrl,
      zoom_host_email: zoomEmail || null,
      display_order: displayOrder,
      active: activeResult,
      subjectScores,
      availability,
      bio,
      bioEn,
      videoUrl: videoUrl || null,
      languages,
      lessonFormat,
      sourceRow,
    });
  });

  return { rows: parsed, errors };
}

function findColumns(header: unknown[]) {
  const columns: Partial<Record<ColumnKey, number>> = {};
  header.forEach((value, index) => {
    const normalized = normalizeHeader(value);
    if (!normalized) return;
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as Array<[ColumnKey, string[]]>) {
      if (columns[key] === undefined && aliases.some((alias) => normalizeHeader(alias) === normalized)) {
        columns[key] = index;
        break;
      }
    }
  });
  return columns;
}

function normalizeHeader(value: unknown) {
  return cellText(value).normalize("NFKC").toLowerCase().replace(/[\s_\-./()（）·:*]/g, "");
}

function read(row: unknown[], index: number | undefined) {
  return index === undefined ? "" : cellText(row[index]);
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function requiredText(
  row: unknown[], index: number | undefined, sourceRow: number, field: string, max: number, errors: TutorImportError[],
) {
  const value = read(row, index);
  if (!value) errors.push({ row: sourceRow, field, message: "필수 값입니다." });
  if (value.length > max) errors.push({ row: sourceRow, field, message: `${max}자 이하로 입력해 주세요.` });
  return value;
}

function optionalText(
  row: unknown[], index: number | undefined, sourceRow: number, field: string, max: number, errors: TutorImportError[],
) {
  const value = read(row, index);
  if (value.length > max) errors.push({ row: sourceRow, field, message: `${max}자 이하로 입력해 주세요.` });
  return value || null;
}

function parseCategory(value: string, exam: string): TutorImportCategory | null {
  const source = (value || exam).normalize("NFKC").toLowerCase().replace(/[\s_-]/g, "");
  if (source === "ib" || source.startsWith("ib") || source.includes("internationalbaccalaureate")) return "ib";
  if (source === "ap" || source.startsWith("ap") || source.includes("advancedplacement")) return "ap";
  if (source.includes("alevel") || source.includes("igcse") || source.includes("gcse")) return "alevel";
  if (source.includes("sat") || source.includes("act")) return "sat";
  if (source.includes("ielts") || source.includes("toefl") || source.includes("영어")) return "english";
  return null;
}

function parseActive(value: string): boolean | string {
  if (!value) return false;
  const normalized = value.normalize("NFKC").toLowerCase().replace(/\s/g, "");
  if (["true", "1", "yes", "y", "예", "공개", "활성"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "아니오", "비공개", "비활성"].includes(normalized)) return false;
  return "TRUE/FALSE 또는 공개/비공개로 입력해 주세요.";
}

function parseAssetUrl(value: string, row: number, field: string, errors: TutorImportError[]) {
  if (!value) return null;
  if (!isSafeUrl(value)) errors.push({ row, field, message: "https:// 주소 또는 /로 시작하는 사이트 내부 경로를 입력해 주세요." });
  return isSafeUrl(value) ? value : null;
}

function parseBanner(value: string, university: string | null, universityEn: string | null, row: number, errors: TutorImportError[]) {
  const normalized = value.normalize("NFKC").toLowerCase().trim();
  if (normalized) {
    if (["korea", "ku", "고려", "고려대학교"].includes(normalized)) return "/university-korea-banner.png";
    if (["snu", "서울", "서울대학교", "seoulnationaluniversity"].includes(normalized.replace(/\s/g, ""))) return "/university-snu-banner.png";
    if (["yonsei", "yu", "연세", "연세대학교"].includes(normalized)) return "/university-yonsei-banner.png";
    return parseAssetUrl(value, row, "대학교 배너", errors);
  }
  const school = `${university ?? ""} ${universityEn ?? ""}`.toLowerCase();
  if (school.includes("고려") || school.includes("korea university")) return "/university-korea-banner.png";
  if (school.includes("서울") || school.includes("seoul national")) return "/university-snu-banner.png";
  if (school.includes("연세") || school.includes("yonsei")) return "/university-yonsei-banner.png";
  return null;
}

function isSafeUrl(value: string) {
  if (value.startsWith("/")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseSubjectScores(value: string, row: number, errors: TutorImportError[]) {
  if (!value) return [];
  const entries = value.split(/[|;\n]+/).map((part) => part.trim()).filter(Boolean);
  if (entries.length > 12) {
    errors.push({ row, field: "과목별 성적", message: "최대 12개까지 입력할 수 있습니다." });
  }
  const scores: Array<{ subject: string; score: string }> = [];
  entries.slice(0, 12).forEach((entry) => {
    const separator = entry.lastIndexOf(":") >= 0 ? entry.lastIndexOf(":") : entry.lastIndexOf("=");
    const subject = separator >= 0 ? entry.slice(0, separator).trim() : "";
    const score = separator >= 0 ? entry.slice(separator + 1).trim() : "";
    if (!subject || !score) {
      errors.push({ row, field: "과목별 성적", message: `‘과목:성적’ 형식으로 입력해 주세요: ${entry}` });
      return;
    }
    if (subject.length > 80 || score.length > 24) {
      errors.push({ row, field: "과목별 성적", message: "과목은 80자, 성적은 24자 이하로 입력해 주세요." });
      return;
    }
    scores.push({ subject, score });
  });
  return scores;
}

function parseAvailability(value: string, row: number, day: string, errors: TutorImportError[]) {
  if (!value) return [];
  const ranges = value.replace(/[–—]/g, "-").split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean);
  if (ranges.length > 6) {
    errors.push({ row, field: `${day} 가능 시간`, message: "하루 최대 6개 구간까지 입력할 수 있습니다." });
  }
  const normalized: string[] = [];
  ranges.slice(0, 6).forEach((range) => {
    const match = /^(\d{1,2}):([0-5]\d)\s*-\s*(\d{1,2}):([0-5]\d)$/.exec(range);
    if (!match) {
      errors.push({ row, field: `${day} 가능 시간`, message: `HH:MM-HH:MM 형식을 확인해 주세요: ${range}` });
      return;
    }
    const fromHour = Number(match[1]);
    const toHour = Number(match[3]);
    if (fromHour > 23 || toHour > 24 || (toHour === 24 && match[4] !== "00")) {
      errors.push({ row, field: `${day} 가능 시간`, message: `시간 범위를 확인해 주세요: ${range}` });
      return;
    }
    const from = `${String(fromHour).padStart(2, "0")}:${match[2]}`;
    const to = `${String(toHour).padStart(2, "0")}:${match[4]}`;
    if (from >= to) {
      errors.push({ row, field: `${day} 가능 시간`, message: `종료 시각은 시작 시각보다 늦어야 합니다: ${range}` });
      return;
    }
    normalized.push(`${from}-${to}`);
  });
  return normalized;
}
