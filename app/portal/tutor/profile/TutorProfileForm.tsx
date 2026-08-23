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

export type PendingRequest = { createdAt: string; note: string | null } | null;

const DAYS: Array<{ key: string; ko: string; en: string }> = [
  { key: "mon", ko: "월요일", en: "Monday" },
  { key: "tue", ko: "화요일", en: "Tuesday" },
  { key: "wed", ko: "수요일", en: "Wednesday" },
  { key: "thu", ko: "목요일", en: "Thursday" },
  { key: "fri", ko: "금요일", en: "Friday" },
  { key: "sat", ko: "토요일", en: "Saturday" },
  { key: "sun", ko: "일요일", en: "Sunday" },
];

// The card itself is read-only: what visitors see is whatever the admin has
// approved. Edits are proposed here and applied by an admin.
export default function TutorProfileForm({
  profile,
  pending,
}: {
  profile: TutorProfile;
  pending: PendingRequest;
}) {
  const { text: l } = usePortalText();
  const [editing, setEditing] = useState(false);
  const [availability, setAvailability] = useState(profile.availability);
  const [scores, setScores] = useState(
    profile.subjectScores.length ? profile.subjectScores : [{ subject: "", score: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");

  const setDay = (day: string, value: string) => {
    const ranges = value.split(",").map((range) => range.trim()).filter(Boolean);
    setAvailability((current) => ({ ...current, [day]: ranges }));
  };
  const setScore = (index: number, key: "subject" | "score", value: string) => {
    setScores((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/tutor/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availability,
          subjectScores: scores.filter((row) => row.subject.trim() && row.score.trim()),
          bio: form.get("bio"),
          bioEn: form.get("bioEn"),
          videoUrl: form.get("videoUrl"),
          languages: form.get("languages"),
          lessonFormat: form.get("lessonFormat"),
          note: form.get("note"),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || l("보내지 못했습니다.", "Could not send."));
      setTone("ok");
      setMessage(
        result?.replaced
          ? l("기존 요청을 새 내용으로 교체했습니다. 관리자 검토 후 반영됩니다.", "Your open request was replaced. An admin will review it.")
          : l("변경 요청을 보냈습니다. 관리자 검토 후 반영됩니다.", "Change request sent. An admin will review it."),
      );
      setEditing(false);
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : l("네트워크를 확인해 주세요.", "Check your connection."));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className={styles.form}>
        {pending && (
          <p className={styles.pending}>
            {l("검토 대기 중인 변경 요청이 있습니다", "A change request is awaiting review")} · {formatDate(pending.createdAt)}
          </p>
        )}
        {message && <p className={styles.message} data-tone={tone} role="status">{message}</p>}

        <section className={styles.block}>
          <h2 className={styles.readHead}>{l("현재 카드", "Your current card")}</h2>
          <p className={styles.hint}>
            {l(
              "공개 카드에 표시되는 내용입니다. 직접 수정할 수 없고, 변경 요청을 보내면 관리자가 확인 후 반영합니다.",
              "This is what visitors see. You cannot edit it directly; send a change request and an admin will apply it.",
            )}
          </p>
          <dl className={styles.readList}>
            <div>
              <dt>{l("과목별 성적", "Scores by subject")}</dt>
              <dd>
                {profile.subjectScores.length
                  ? profile.subjectScores.map((row) => `${row.subject} · ${row.score}`).join(", ")
                  : l("등록된 내용 없음", "Not set")}
              </dd>
            </div>
            <div>
              <dt>{l("가능 시간", "Availability")}</dt>
              <dd>
                {DAYS.some((day) => (profile.availability[day.key] || []).length)
                  ? DAYS.filter((day) => (profile.availability[day.key] || []).length)
                      .map((day) => `${l(day.ko, day.en)} ${(profile.availability[day.key] || []).join(", ")}`)
                      .join(" / ")
                  : l("등록된 내용 없음", "Not set")}
              </dd>
            </div>
            <div><dt>{l("소개 (한국어)", "Description (Korean)")}</dt><dd>{profile.bio || l("등록된 내용 없음", "Not set")}</dd></div>
            <div><dt>{l("소개 (영어)", "Description (English)")}</dt><dd>{profile.bioEn || l("등록된 내용 없음", "Not set")}</dd></div>
            <div><dt>{l("샘플 수업 영상", "Sample lesson video")}</dt><dd>{profile.videoUrl || l("등록된 내용 없음", "Not set")}</dd></div>
            <div><dt>{l("언어", "Languages")}</dt><dd>{profile.languages || l("등록된 내용 없음", "Not set")}</dd></div>
            <div><dt>{l("수업 형식", "Lesson format")}</dt><dd>{profile.lessonFormat || l("등록된 내용 없음", "Not set")}</dd></div>
          </dl>
        </section>

        <div className={styles.actions}>
          <button type="button" onClick={() => setEditing(true)}>
            {l("변경 요청하기", "Request a change")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <p className={styles.hint}>
        {l(
          "아래 내용은 요청서입니다. 저장해도 카드에 바로 반영되지 않고, 관리자가 검토 후 적용합니다.",
          "This is a request, not a save. An admin reviews it before anything changes on your card.",
        )}
      </p>

      <fieldset className={styles.block}>
        <legend>{l("과목별 성적", "Scores by subject")}</legend>
        {scores.map((row, index) => (
          <div className={styles.pair} key={index}>
            <input value={row.subject} onChange={(event) => setScore(index, "subject", event.target.value)} maxLength={80} placeholder={l("예: IB Economics HL", "e.g. IB Economics HL")} aria-label={l("과목", "Subject")} />
            <input value={row.score} onChange={(event) => setScore(index, "score", event.target.value)} maxLength={24} placeholder={l("예: 7", "e.g. 7")} aria-label={l("성적", "Score")} />
            <button type="button" onClick={() => setScores((current) => current.filter((_, i) => i !== index))} aria-label={l("삭제", "Remove")}>×</button>
          </div>
        ))}
        <button type="button" className={styles.add} onClick={() => setScores((current) => [...current, { subject: "", score: "" }])}>
          {l("과목 추가", "Add subject")}
        </button>
      </fieldset>

      <fieldset className={styles.block}>
        <legend>{l("가능 시간", "Availability")}</legend>
        <p className={styles.hint}>
          {l("24시간 형식으로 입력하세요. 여러 구간은 쉼표로 구분합니다. 예: 18:00-21:00, 22:00-23:00", "Use 24-hour times. Separate several windows with commas, e.g. 18:00-21:00, 22:00-23:00")}
        </p>
        {DAYS.map((day) => (
          <label className={styles.dayRow} key={day.key}>
            <span>{l(day.ko, day.en)}</span>
            <input defaultValue={(profile.availability[day.key] || []).join(", ")} onChange={(event) => setDay(day.key, event.target.value)} placeholder="18:00-21:00" aria-label={l(`${day.ko} 가능 시간`, `${day.en} availability`)} />
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.block}>
        <legend>{l("소개와 자료", "Description and media")}</legend>
        <label className={styles.field}><span>{l("소개 (한국어)", "Description (Korean)")}</span><textarea name="bio" rows={4} maxLength={600} defaultValue={profile.bio} /></label>
        <label className={styles.field}><span>{l("소개 (영어)", "Description (English)")}</span><textarea name="bioEn" rows={4} maxLength={600} defaultValue={profile.bioEn} /></label>
        <label className={styles.field}>
          <span>{l("샘플 수업 영상 주소", "Sample lesson video URL")}</span>
          <input name="videoUrl" type="url" maxLength={400} defaultValue={profile.videoUrl} placeholder="https://" />
          <small>{l("YouTube·Vimeo 링크 또는 mp4 파일 주소", "A YouTube or Vimeo link, or an mp4 URL")}</small>
        </label>
        <div className={styles.grid2}>
          <label className={styles.field}><span>{l("언어", "Languages")}</span><input name="languages" maxLength={80} defaultValue={profile.languages} placeholder={l("한국어, 영어", "Korean, English")} /></label>
          <label className={styles.field}><span>{l("수업 형식", "Lesson format")}</span><input name="lessonFormat" maxLength={80} defaultValue={profile.lessonFormat} placeholder={l("온라인 1:1", "Online 1:1")} /></label>
        </div>
      </fieldset>

      <fieldset className={styles.block}>
        <legend>{l("관리자에게 남길 메모", "Note for the admin")}</legend>
        <label className={styles.field}>
          <textarea name="note" rows={3} maxLength={1000} placeholder={l("변경 이유나 참고 사항을 적어 주세요.", "Why the change, or anything the admin should know.")} />
        </label>
      </fieldset>

      <div className={styles.actions}>
        <button type="submit" disabled={busy}>{busy ? l("보내는 중...", "Sending...") : l("변경 요청 보내기", "Send request")}</button>
        <button type="button" className={styles.ghost} onClick={() => { setEditing(false); setMessage(""); }}>
          {l("취소", "Cancel")}
        </button>
        {message && <p className={styles.message} data-tone={tone} role="status">{message}</p>}
      </div>
    </form>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
