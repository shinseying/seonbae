export type SubjectScore = { subject: string; score: string };

export type CurriculumKey = 'ib' | 'ap' | 'alevel' | 'igcse' | 'tests';

export type PublicTutor = {
  registry_id: string;
  roster_number?: string | null;
  name: string;
  name_en?: string;
  exam: string;
  score: string;
  category?: string;
  university?: string;
  university_en?: string;
  photo_url?: string | null;
  banner_url?: string | null;
  subject_scores?: SubjectScore[];
  availability?: Record<string, string[]>;
  bio?: string | null;
  bio_en?: string | null;
  video_url?: string | null;
  languages?: string | null;
  lesson_format?: string | null;
  display_order?: number;
  created_at?: string | null;
  active?: boolean;
};

export const curriculumOrder: CurriculumKey[] = ['ib', 'ap', 'alevel', 'igcse', 'tests'];

export const curriculumNames: Record<CurriculumKey, { en: string; ko: string }> = {
  ib: { en: 'IB Diploma', ko: 'IB 디플로마' },
  ap: { en: 'Advanced Placement', ko: 'AP' },
  alevel: { en: 'A Level', ko: 'A레벨' },
  igcse: { en: 'IGCSE', ko: 'IGCSE' },
  tests: { en: 'Tests & English', ko: 'SAT·ACT·영어 시험' },
};

export const categoriesFor = (tutor: PublicTutor) => {
  const subjects = Array.isArray(tutor.subject_scores)
    ? tutor.subject_scores.map((row) => row?.subject || '').join(' ')
    : '';
  const value = `${tutor.exam} ${tutor.category || ''} ${subjects}`.toUpperCase();
  const categories = new Set<CurriculumKey>();
  if (/\bIB\b/.test(value)) categories.add('ib');
  if (/\bAP\b|ADVANCED PLACEMENT/.test(value)) categories.add('ap');
  if (/A[ -]?LEVEL/.test(value)) categories.add('alevel');
  if (/IGCSE|\bGCSE\b/.test(value)) categories.add('igcse');
  if (/SAT|ACT|TOEFL|IELTS|ENGLISH|영어/.test(value)) categories.add('tests');
  if (!categories.size) categories.add('tests');
  return [...categories];
};

export const scoresOf = (tutor: PublicTutor): SubjectScore[] => Array.isArray(tutor.subject_scores)
  ? tutor.subject_scores.filter((row) => (row?.subject || '').trim() && (row?.score || '').trim() !== '.')
  : [];

export const scoreValue = (row: SubjectScore) => {
  const raw = row.score.trim().toUpperCase();
  const fraction = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction && Number(fraction[2])) return Number(fraction[1]) / Number(fraction[2]);
  const stars = (raw.match(/A\*/g) || []).length;
  if (stars) return 1 + stars / 100;
  const numeric = Number(raw.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 9) return numeric / 9;
  if (numeric <= 100) return numeric / 100;
  return numeric / 1600;
};

export const displayOrderOf = (tutor: PublicTutor) => Number.isFinite(Number(tutor.display_order))
  ? Number(tutor.display_order)
  : Number.MAX_SAFE_INTEGER;

export const defaultTutorSort = (a: PublicTutor, b: PublicTutor) => displayOrderOf(a) - displayOrderOf(b)
  || a.registry_id.localeCompare(b.registry_id);

export const tutorStrength = (tutor: PublicTutor) => {
  const rows = scoresOf(tutor);
  return rows.length * 10 + rows.reduce((total, row) => total + scoreValue(row), 0);
};

export const recommendedTutorSort = (a: PublicTutor, b: PublicTutor) => tutorStrength(b) - tutorStrength(a)
  || defaultTutorSort(a, b);
