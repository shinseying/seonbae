"use client";

import { FormEvent, useState } from "react";
import { usePortalText } from "../../PortalLocale";
import styles from "./profile.module.css";

export type TutorProfile = {
  availability: Record<string, string[]>;
  subjectScores: Array<{ subject: string; score: string }>;
  bio: string;
  bioEn: string;
  videoUrl: string;
  languages: string;
  lessonFormat: string;
};

const DAYS: Array<{ key: string; ko: string; en: string }> = [
  { key: "mon", ko: "월요일", en: "Monday" },
  { key: "tue", ko: "화요일", en: "Tuesday" },
  { key: "wed", ko: "수요일", en: "Wednesday" },
  { key: "thu", ko: "목요일", en: "Thursday" },
  { key: "fri", ko: "금요일", en: "Friday" },
  { key: "sat", ko: "토요일", en: "Saturday" },
  { key: "sun", ko: "일요일", en: "Sunday" },
];

export default function TutorProfileForm({ profile }: { profile: TutorProfile }) {
  const { text: l } = usePortalText();
  const [availability, setAvailability] = useState(profile.availability);
  const [scores, setScores] = useState(
    profile.subjectScores.length ? profile.subjectScores : [{ subject: "", score: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");

  // Availability is stored as "HH:MM-HH:MM" strings per day, edited here as one
  // comma-separated field per day so a tutor can add several windows.
  const setDay = (day: string, value: string) => {
    const ranges = value.split(",").map((range) => range.trim()).filter(Boolean);
    setAvailability((current) => ({ ...current, [day]: ranges }));
  };

  const setScore = (index: number, key: "subject" | "score", value: string) => {
    setScores((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/tutor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availability,
          subjectScores: scores.filter((row) => row.subject.trim() && row.score.trim()),
          bio: form.get("bio"),
          bioEn: form.get("bioEn"),
          videoUrl: form.get("videoUrl"),
          languages: form.get("languages"),
          lessonFormat: form.get("lessonFormat"),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || l("저장하지 못했습니다.", "Could not save."));
      setTone("ok");
      setMessage(l("저장했습니다. 튜터 카드에 바로 반영됩니다.", "Saved. Your card is updated."));
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : l("네트워크를 확인해 주세요.", "Check your connection."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <fieldset className={styles.block}>
        <legend>{l("과목별 성적", "Scores by subject")}</legend>
        <p className={styles.hint}>
          {l("튜터 카드의 성적 배지로 표시됩니다.", "Shown as the score badges on your card.")}
        </p>
        {scores.map((row, index) => (
          <div className={styles.pair} key={index}>
            <input
              value={row.subject}
              onChange={(event) => setScore(index, "subject", event.target.value)}
              maxLength={80}
              placeholder={l("예: IB Economics HL", "e.g. IB Economics HL")}
              aria-label={l("과목", "Subject")}
            />
            <input
              value={row.score}
              onChange={(event) => setScore(index, "score", event.target.value)}
              maxLength={24}
              placeholder={l("예: 7", "e.g. 7")}
              aria-label={l("성적", "Score")}
            />
            <button
              type="button"
              onClick={() => setScores((current) => current.filter((_, i) => i !== index))}
              aria-label={l("삭제", "Remove")}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.add}
          onClick={() => setScores((current) => [...current, { subject: "", score: "" }])}
        >
          {l("과목 추가", "Add subject")}
        </button>
      </fieldset>

      <fieldset className={styles.block}>
        <legend>{l("가능 시간", "Availability")}</legend>
        <p className={styles.hint}>
          {l(
            "24시간 형식으로 입력하세요. 여러 구간은 쉼표로 구분합니다. 예: 18:00-21:00, 22:00-23:00",
            "Use 24-hour times. Separate several windows with commas, e.g. 18:00-21:00, 22:00-23:00",
          )}
        </p>
        {DAYS.map((day) => (
          <label className={styles.dayRow} key={day.key}>
            <span>{l(day.ko, day.en)}</span>
            <input
              defaultValue={(profile.availability[day.key] || []).join(", ")}
              onChange={(event) => setDay(day.key, event.target.value)}
              placeholder="18:00-21:00"
              aria-label={l(`${day.ko} 가능 시간`, `${day.en} availability`)}
            />
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.block}>
        <legend>{l("소개와 자료", "Description and media")}</legend>
        <label className={styles.field}>
          <span>{l("소개 (한국어)", "Description (Korean)")}</span>
          <textarea name="bio" rows={4} maxLength={600} defaultValue={profile.bio} />
        </label>
        <label className={styles.field}>
          <span>{l("소개 (영어)", "Description (English)")}</span>
          <textarea name="bioEn" rows={4} maxLength={600} defaultValue={profile.bioEn} />
        </label>
        <label className={styles.field}>
          <span>{l("샘플 수업 영상 주소", "Sample lesson video URL")}</span>
          <input name="videoUrl" type="url" maxLength={400} defaultValue={profile.videoUrl} placeholder="https://" />
          <small>{l("YouTube·Vimeo 링크 또는 mp4 파일 주소", "A YouTube or Vimeo link, or an mp4 URL")}</small>
        </label>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span>{l("언어", "Languages")}</span>
            <input name="languages" maxLength={80} defaultValue={profile.languages} placeholder={l("한국어, 영어", "Korean, English")} />
          </label>
          <label className={styles.field}>
            <span>{l("수업 형식", "Lesson format")}</span>
            <input name="lessonFormat" maxLength={80} defaultValue={profile.lessonFormat} placeholder={l("온라인 1:1", "Online 1:1")} />
          </label>
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button type="submit" disabled={busy}>
          {busy ? l("저장 중...", "Saving...") : l("저장", "Save")}
        </button>
        {message && (
          <p className={styles.message} data-tone={tone} role="status">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
