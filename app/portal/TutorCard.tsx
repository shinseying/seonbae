import type { CSSProperties } from "react";
import styles from "./tutor-card.module.css";

// A React reproduction of the public tutor card (tcardx) so the tutor's own
// change-request preview and the admin editor show exactly the layout visitors
// see. Missing fields fall back to placeholders, matching the public card.
export type TutorCardData = {
  registryId: string;
  rosterNumber?: string | null;
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

const SCHEDULE_START = 6 * 60;
const SCHEDULE_END = 24 * 60;
const SCHEDULE_SPAN = SCHEDULE_END - SCHEDULE_START;
const TIMETABLE_DAYS = [
  { key: "mon", label: "월" },
  { key: "tue", label: "화" },
  { key: "wed", label: "수" },
  { key: "thu", label: "목" },
  { key: "fri", label: "금" },
  { key: "sat", label: "토" },
  { key: "sun", label: "일" },
] as const;

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
    : tutor.score?.trim()
      ? [{ score: tutor.score, subject: tutor.exam || "과목 성적" }]
      : [];

  return (
    <article className={styles.card}>
      <span className={styles.verified}>✓ 검증 완료</span>
      {tutor.photoUrl ? (
        <img className={styles.avatar} src={tutor.photoUrl} alt={`${tutor.name} 프로필 사진`} width={320} height={320} />
      ) : (
        <span className={`${styles.avatar} ${styles.avatarFallback}`}>{initials(tutor.name)}</span>
      )}
      <h3 className={styles.name}>{tutor.name}<small>{tutor.rosterNumber || tutor.registryId}</small></h3>
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
      </dl>
      <AvailabilityTimetable availability={tutor.availability} />
    </article>
  );
}

function AvailabilityTimetable({ availability }: { availability?: Record<string, string[]> | null }) {
  const slots = availability || {};
  const blocks = TIMETABLE_DAYS.flatMap((day, dayIndex) => {
    const ranges = Array.isArray(slots[day.key]) ? slots[day.key] : [];
    return ranges.flatMap((range, rangeIndex) => {
      const parsed = parseRange(range);
      if (!parsed) return [];
      const start = Math.max(SCHEDULE_START, parsed.start);
      const end = Math.min(SCHEDULE_END, parsed.end);
      if (end <= start) return [];
      return [{ dayIndex, rangeIndex, range, start, end }];
    });
  });

  return (
    <section className={styles.availability}>
      <div className={styles.availabilityHead}>
        <b>가능 시간</b>
        <span>06–24시</span>
      </div>
      <div className={styles.weekGrid} role="group" aria-label={blocks.length
        ? `튜터의 주간 가능 시간표: ${blocks.map((block) => `${TIMETABLE_DAYS[block.dayIndex].label}요일 ${block.range}`).join(", ")}`
        : "등록된 가능 시간이 없는 빈 주간 시간표"}>
        <div className={styles.weekHead}>
          <span aria-hidden="true" />
          {TIMETABLE_DAYS.map((day) => <b key={day.key}>{day.label}</b>)}
        </div>
        <div className={styles.weekBody}>
          <div className={styles.timeRail} aria-hidden="true">
            {[6, 12, 18, 24].map((hour) => (
              <span key={hour} style={{ "--time-top": ((hour * 60 - SCHEDULE_START) / SCHEDULE_SPAN) * 100 } as CSSProperties}>
                {String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>
          <div className={styles.weekPlot}>
            {blocks.map((block) => (
              <span
                className={styles.timeBlock}
                key={`${block.dayIndex}-${block.rangeIndex}-${block.range}`}
                tabIndex={0}
                role="img"
                data-tone={(block.dayIndex + block.rangeIndex) % 5}
                data-time-label={`${TIMETABLE_DAYS[block.dayIndex].label} ${block.range}`}
                title={`${TIMETABLE_DAYS[block.dayIndex].label} ${block.range}`}
                aria-label={`${TIMETABLE_DAYS[block.dayIndex].label}요일 ${block.range}`}
                style={{
                  "--day-index": block.dayIndex,
                  "--slot-top": ((block.start - SCHEDULE_START) / SCHEDULE_SPAN) * 100,
                  "--slot-height": ((block.end - block.start) / SCHEDULE_SPAN) * 100,
                } as CSSProperties}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function parseRange(value: string) {
  const match = value.match(/^\s*(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*$/);
  if (!match) return null;
  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4]);
  if (startHour > 24 || endHour > 24 || startMinute > 59 || endMinute > 59) return null;
  if ((startHour === 24 && startMinute !== 0) || (endHour === 24 && endMinute !== 0)) return null;
  return { start: startHour * 60 + startMinute, end: endHour * 60 + endMinute };
}
