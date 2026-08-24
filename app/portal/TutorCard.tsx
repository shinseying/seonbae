import styles from "./tutor-card.module.css";

// A React reproduction of the public tutor card (tcardx) so the tutor's own
// change-request preview and the admin editor show exactly the layout visitors
// see. Missing fields fall back to placeholders, matching the public card.
export type TutorCardData = {
  registryId: string;
  name: string;
  university?: string | null;
  photoUrl?: string | null;
  exam?: string;
  score?: string;
  subjectScores?: Array<{ subject: string; score: string }> | null;
  availability?: Record<string, string[]> | null;
  bio?: string | null;
  bioEn?: string | null;
  videoUrl?: string | null;
  languages?: string | null;
  lessonFormat?: string | null;
};

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND = ["sat", "sun"];

function availabilitySummary(availability?: Record<string, string[]> | null) {
  const slots = availability || {};
  const week = WEEKDAYS.some((day) => (slots[day] || []).length > 0);
  const end = WEEKEND.some((day) => (slots[day] || []).length > 0);
  if (week && end) return "평일·주말";
  if (week) return "평일";
  if (end) return "주말";
  return "문의";
}

function initials(value: string) {
  const clean = value.trim();
  if (!clean) return "선";
  return /^[가-힣]/.test(clean)
    ? clean.slice(-2)
    : clean.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
}

export default function TutorCard({ tutor }: { tutor: TutorCardData }) {
  const bio = tutor.bio || tutor.bioEn || "";
  const scores = (tutor.subjectScores ?? []).filter((row) => row.subject.trim() && row.score.trim());
  const scoreList = scores.length
    ? scores
    : [{ score: tutor.score || "—", subject: tutor.exam || "검증 성적" }];

  return (
    <article className={styles.card}>
      <span className={styles.verified}>✓ 검증 완료</span>
      {tutor.photoUrl ? (
        <img className={styles.avatar} src={tutor.photoUrl} alt={`${tutor.name} 프로필 사진`} width={320} height={320} />
      ) : (
        <span className={`${styles.avatar} ${styles.avatarFallback}`}>{initials(tutor.name)}</span>
      )}
      <h3 className={styles.name}>{tutor.name}<small>{tutor.registryId}</small></h3>
      <p className={styles.uni}>{tutor.university || "선배 검증 튜터"}</p>
      <ul className={styles.scores}>
        {scoreList.map((row, index) => (
          <li key={index}><b>{row.score}</b><span>{row.subject}</span></li>
        ))}
      </ul>
      <p className={`${styles.bio} ${bio ? "" : styles.bioEmpty}`}>
        {bio || "소개글 준비 중입니다."}
      </p>
      <span className={`${styles.video} ${tutor.videoUrl ? "" : styles.videoEmpty}`}>
        ▶ {tutor.videoUrl ? "샘플 수업 보기" : "샘플 수업 준비 중"}
      </span>
      <dl className={styles.meta}>
        <div><dt>언어</dt><dd>{tutor.languages || "한국어, 영어"}</dd></div>
        <div><dt>형식</dt><dd>{tutor.lessonFormat || "온라인 1:1"}</dd></div>
        <div><dt>가능 시간</dt><dd>{availabilitySummary(tutor.availability)}</dd></div>
      </dl>
    </article>
  );
}
