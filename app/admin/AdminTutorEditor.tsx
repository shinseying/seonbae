"use client";

import { useEffect, useRef, useState } from "react";
import AdminSidebar from "./AdminSidebar";
import TutorCard from "../portal/TutorCard";
import {
  parseTutorSpreadsheet,
  type TutorImportError,
  type TutorImportRow,
} from "../../utils/tutors/excel-import";
import { createTutorRegistryId } from "../../utils/tutors/registry-id";
import { createTutorPhotoDraftTracker } from "../../utils/tutors/photo-draft-tracker";
import styles from "./admin.module.css";

export type AdminTutor = {
  registry_id: string;
  roster_number: string | null;
  name: string;
  exam: string;
  score: string;
  category: "ib" | "ap" | "alevel" | "sat" | "english";
  university: string | null;
  university_en: string | null;
  photo_url: string | null;
  photo_path: string | null;
  banner_url: string | null;
  zoom_host_email: string | null;
  display_order: number;
  active: boolean;
  subject_scores?: Array<{ subject: string; score: string }> | null;
  availability?: Record<string, string[]> | null;
  bio?: string | null;
  bio_en?: string | null;
  video_url?: string | null;
  languages?: string | null;
  lesson_format?: string | null;
};

export type AdminAccount = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  tutor_registry_id: string | null;
};

const DAY_FIELDS = [
  { key: "mon", label: "월요일" },
  { key: "tue", label: "화요일" },
  { key: "wed", label: "수요일" },
  { key: "thu", label: "목요일" },
  { key: "fri", label: "금요일" },
  { key: "sat", label: "토요일" },
  { key: "sun", label: "일요일" },
];

const bannerOptions = [
  { value: "/university-korea-banner.png", label: "고려대학교 배너" },
  { value: "/university-snu-banner.png", label: "서울대학교 배너" },
  { value: "/university-yonsei-banner.png", label: "연세대학교 배너" },
];

// A card being created lives outside the saved list until it is written, so
// editing its registry number does not break the selection.
const DRAFT_KEY = "__draft__";
const TUTOR_PREVIEW_STORAGE_KEY = "seonbae:tutor-import-preview:v1";

function requestPhotoCleanup(path: string, keepalive = false) {
  return fetch(`/api/admin/tutors/photo?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
    keepalive,
  }).catch(() => undefined);
}

type ImportPreview = {
  fileName: string;
  rows: TutorImportRow[];
  errors: TutorImportError[];
};

function emptyTutor(registryId: string, displayOrder: number): AdminTutor {
  return {
    registry_id: registryId,
    roster_number: null,
    name: "",
    exam: "",
    score: "",
    category: "ib",
    university: null,
    university_en: null,
    photo_url: null,
    photo_path: null,
    banner_url: null,
    zoom_host_email: null,
    display_order: displayOrder,
    active: false,
    subject_scores: [],
    availability: {},
    bio: null,
    bio_en: null,
    video_url: null,
    languages: null,
    lesson_format: null,
  };
}

// Keep the sandbox representative of the current directory without carrying
// operational account data (such as the tutor's Zoom host email) into browser
// storage. These are all fields that can already appear on a public card.
function tutorPreviewSnapshot(tutor: AdminTutor) {
  return {
    registry_id: tutor.registry_id,
    roster_number: tutor.roster_number,
    name: tutor.name,
    exam: tutor.exam,
    score: tutor.score,
    category: tutor.category,
    university: tutor.university,
    university_en: tutor.university_en,
    photo_url: tutor.photo_url,
    photo_path: tutor.photo_path,
    banner_url: tutor.banner_url,
    display_order: tutor.display_order,
    active: tutor.active,
    subject_scores: tutor.subject_scores ?? [],
    availability: tutor.availability ?? {},
    bio: tutor.bio,
    bio_en: tutor.bio_en,
    video_url: tutor.video_url,
    languages: tutor.languages,
    lesson_format: tutor.lesson_format,
  };
}

export default function AdminTutorEditor({
  adminName,
  initialTutors,
  accounts,
}: {
  adminName: string;
  initialTutors: AdminTutor[];
  accounts: AdminAccount[];
}) {
  const [tutors, setTutors] = useState(initialTutors);
  const [committedTutors, setCommittedTutors] = useState(initialTutors);
  const [links, setLinks] = useState(accounts);
  // The availability inputs are free text, but the model behind them is an
  // array. Round-tripping through split/join ate the comma the moment it was
  // typed, so the typed text is held here and only parsed into the array.
  const [dayText, setDayText] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState(false);
  const [draft, setDraft] = useState<AdminTutor | null>(null);
  const [selectedId, setSelectedId] = useState(initialTutors[0]?.registry_id ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [readingWorkbook, setReadingWorkbook] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const photoDrafts = useRef(createTutorPhotoDraftTracker());
  const selectedIdRef = useRef(selectedId);
  const mountedRef = useRef(false);
  selectedIdRef.current = selectedId;
  const isDraft = selectedId === DRAFT_KEY;
  const selected = isDraft ? draft : tutors.find((tutor) => tutor.registry_id === selectedId) ?? null;
  const featuredScore = selected?.subject_scores?.find((row) => row.subject.trim() && row.score.trim()) ?? null;
  const displayRosterNumber = selected?.roster_number || (isDraft ? "저장 후 자동 배정" : "배정 대기");
  const linkedAccount = selected && !isDraft
    ? links.find((account) => account.tutor_registry_id === selected.registry_id) ?? null
    : null;

  useEffect(() => {
    mountedRef.current = true;
    const cleanupEveryPhotoDraft = () => {
      for (const path of photoDrafts.current.abandonAll()) {
        void requestPhotoCleanup(path, true);
      }
    };
    window.addEventListener("pagehide", cleanupEveryPhotoDraft);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", cleanupEveryPhotoDraft);
      cleanupEveryPhotoDraft();
    };
  }, []);

  function updateSelected<K extends keyof AdminTutor>(key: K, value: AdminTutor[K]) {
    if (isDraft) setDraft((current) => current && { ...current, [key]: value });
    else setTutors((current) => current.map((tutor) => tutor.registry_id === selectedId ? { ...tutor, [key]: value } : tutor));
    setMessage("");
  }

  function activateSelection(nextId: string) {
    // Async upload completion must see a selection change immediately.
    selectedIdRef.current = nextId;
    setSelectedId(nextId);
  }

  function startDraft() {
    abandonPhotoDraft(selectedId);
    const order = tutors.reduce((max, tutor) => Math.max(max, tutor.display_order), 0) + 1;
    setDraft(emptyTutor(createTutorRegistryId(), order));
    activateSelection(DRAFT_KEY);
    setMessage("빈 카드입니다. 필수 항목과 과목별 성적을 채운 뒤 저장하세요.");
  }

  function discardDraft() {
    abandonPhotoDraft(DRAFT_KEY);
    setDraft(null);
    activateSelection(tutors[0]?.registry_id ?? "");
    setMessage("");
  }

  function updateScore(index: number, key: "subject" | "score", value: string) {
    const rows = [...(selected?.subject_scores ?? [])];
    rows[index] = { ...rows[index], [key]: value };
    updateSelected("subject_scores", rows);
  }
  function addScore() {
    if ((selected?.subject_scores?.length ?? 0) >= 12) {
      setMessage("과목별 성적은 최대 12개까지 입력할 수 있습니다.");
      return;
    }
    updateSelected("subject_scores", [...(selected?.subject_scores ?? []), { subject: "", score: "" }]);
  }
  function removeScore(index: number) {
    updateSelected("subject_scores", (selected?.subject_scores ?? []).filter((_, i) => i !== index));
  }
  // Keyed by selection so switching cards falls back to that card's stored value.
  function dayValue(day: string) {
    const key = `${selectedId}|${day}`;
    if (key in dayText) return dayText[key];
    return ((selected?.availability ?? {})[day] ?? []).join(", ");
  }
  function updateDay(day: string, value: string) {
    setDayText((current) => ({ ...current, [`${selectedId}|${day}`]: value }));
    const ranges = value.split(",").map((range) => range.trim()).filter(Boolean);
    updateSelected("availability", { ...(selected?.availability ?? {}), [day]: ranges });
  }

  function selectTutor(nextId: string) {
    if (nextId === selectedId) return;
    abandonPhotoDraft(selectedId);
    activateSelection(nextId);
    setMessage("");
  }

  function abandonPhotoDraft(cardKey: string) {
    const paths = photoDrafts.current.abandon(cardKey);
    if (!paths.length) return;
    for (const path of paths) void requestPhotoCleanup(path);

    if (cardKey === DRAFT_KEY) {
      setDraft((current) => current && paths.includes(current.photo_path || "")
        ? { ...current, photo_url: null, photo_path: null }
        : current);
      return;
    }

    const committed = committedTutors.find((tutor) => tutor.registry_id === cardKey);
    setTutors((current) => current.map((tutor) => (
      tutor.registry_id === cardKey && paths.includes(tutor.photo_path || "")
        ? { ...tutor, photo_url: committed?.photo_url ?? null, photo_path: committed?.photo_path ?? null }
        : tutor
    )));
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(?:jpeg|png|webp)$/.test(file.type) || file.size > 4 * 1024 * 1024) {
      setMessage("프로필 사진은 4MB 이하 JPG, PNG 또는 WebP만 사용할 수 있습니다.");
      return;
    }

    const uploadCardKey = selectedId;
    setUploadingPhoto(true);
    setMessage("");
    const body = new FormData();
    body.set("photo", file);
    try {
      const response = await fetch("/api/admin/tutors/photo", { method: "POST", body });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "사진을 업로드하지 못했습니다.");
      const uploadedPath = typeof result?.photoPath === "string" ? result.photoPath : "";
      if (!uploadedPath) throw new Error("업로드한 사진 경로를 확인하지 못했습니다.");
      if (!mountedRef.current || selectedIdRef.current !== uploadCardKey) {
        void requestPhotoCleanup(uploadedPath, !mountedRef.current);
        return;
      }
      for (const path of photoDrafts.current.replace(uploadCardKey, uploadedPath)) {
        void requestPhotoCleanup(path);
      }
      updateSelected("photo_url", result.photoUrl || null);
      updateSelected("photo_path", uploadedPath);
      setMessage("사진을 올렸습니다. 아래 저장 버튼을 눌러 카드에 반영하세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "사진을 업로드하지 못했습니다.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function usePhotoUrl(value: string) {
    abandonPhotoDraft(selectedId);
    updateSelected("photo_url", value || null);
    updateSelected("photo_path", null);
  }

  async function readWorkbook(file: File | undefined) {
    if (!file) return;
    setImportMessage("");
    setImportPreview(null);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setImportMessage(".xlsx 형식만 지원합니다. 예전 .xls 파일은 Excel에서 .xlsx로 다시 저장해 주세요.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportMessage("파일은 5MB 이하로 준비해 주세요.");
      return;
    }

    setReadingWorkbook(true);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const sheet = await readSheet(file);
      const parsed = parseTutorSpreadsheet(sheet as unknown[][], {
        existingRegistryIds: committedTutors.map((tutor) => tutor.registry_id),
        maxDisplayOrder: committedTutors.reduce((max, tutor) => Math.max(max, tutor.display_order), 0),
      });
      if (parsed.errors.length) {
        setImportPreview({ fileName: file.name, ...parsed });
        setImportMessage("표시된 항목을 엑셀에서 고친 뒤 파일을 다시 선택해 주세요.");
        return;
      }

      // The workbook never leaves the browser. Only the normalized card draft
      // is carried to the isolated directory preview, and sessionStorage keeps
      // it out of URLs, server logs, and other browser tabs.
      window.sessionStorage.setItem(TUTOR_PREVIEW_STORAGE_KEY, JSON.stringify({
        version: 1,
        fileName: file.name,
        createdAt: Date.now(),
        existingRegistryIds: committedTutors.map((tutor) => tutor.registry_id),
        existingRows: committedTutors.map(tutorPreviewSnapshot),
        rows: parsed.rows,
      }));
      setImportMessage(`${parsed.rows.length}명의 샌드박스 미리보기를 여는 중입니다…`);
      window.location.assign("/tutors?sandbox=1");
    } catch (error) {
      console.error("[tutor workbook]", error);
      setImportMessage("엑셀 파일을 읽지 못했습니다. 잠겨 있거나 손상되지 않았는지 확인해 주세요.");
    } finally {
      setReadingWorkbook(false);
    }
  }

  async function saveTutor() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/tutors", {
      method: isDraft ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...selected,
        subjectScores: selected.subject_scores ?? [],
        availability: selected.availability ?? {},
        bioEn: selected.bio_en ?? "",
        videoUrl: selected.video_url ?? "",
        lessonFormat: selected.lesson_format ?? "",
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "저장하지 못했습니다.");
      setSaving(false);
      return;
    }
    for (const path of photoDrafts.current.commit(selectedId, result.photo_path)) {
      void requestPhotoCleanup(path);
    }
    setDayText({});
    if (isDraft) {
      setTutors((current) => [...current, result].sort(byDisplayOrder));
      setCommittedTutors((current) => [...current, result].sort(byDisplayOrder));
      setDraft(null);
      activateSelection(result.registry_id);
      setMessage(`${result.name} 튜터 카드를 만들었습니다. ${result.active ? "공개 명부에 바로 표시됩니다." : "‘공개 명부에 표시’를 켜면 사이트에 나타납니다."}`);
    } else {
      setTutors((current) => current.map((tutor) => tutor.registry_id === selectedId ? result : tutor));
      setCommittedTutors((current) => current.map((tutor) => tutor.registry_id === selectedId ? result : tutor));
      setMessage("저장되었습니다. 공개 튜터 명부에도 바로 반영됩니다.");
    }
    setSaving(false);
  }

  // Assigning writes profiles.tutor_registry_id, which is what the tutor portal
  // gates on. It is a separate call from saving the card so the two cannot half
  // apply.
  async function assignAccount(profileId: string | null) {
    if (!selected || isDraft) return;
    const registryId = selected.registry_id;
    const rosterNumber = selected.roster_number || registryId;
    const target = profileId ? links.find((account) => account.id === profileId) : null;
    if (!profileId && !window.confirm(`${selected.name} (${rosterNumber}) 카드의 계정 연결을 해제할까요? 해당 계정은 학생으로 돌아갑니다.`)) {
      return;
    }

    setAssigning(true);
    setMessage("");
    const response = await fetch("/api/admin/tutors/assignment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registry_id: registryId, profile_id: profileId }),
    });
    const result = await response.json().catch(() => null);
    setAssigning(false);

    if (!response.ok) {
      setMessage(result?.error || "계정 연결을 바꾸지 못했습니다.");
      return;
    }

    setLinks((current) => current.map((account) => {
      if (account.tutor_registry_id === registryId) {
        return { ...account, role: "student", tutor_registry_id: null };
      }
      if (account.id === profileId) {
        return { ...account, role: "tutor", tutor_registry_id: registryId };
      }
      return account;
    }));
    setMessage(profileId
      ? `${accountLabel(target)} 계정에 ${rosterNumber} 카드를 연결했습니다.`
      : `${rosterNumber} 카드의 계정 연결을 해제했습니다.`);
  }

  async function deleteTutor() {
    if (!selected) return;
    if (!window.confirm(`${selected.name} (${selected.roster_number || selected.registry_id}) 튜터 카드를 삭제할까요? 공개 명부에서 즉시 사라지며 되돌릴 수 없습니다.`)) {
      return;
    }

    setDeleting(true);
    setMessage("");
    const response = await fetch(`/api/admin/tutors?registry_id=${encodeURIComponent(selected.registry_id)}`, {
      method: "DELETE",
    });
    const result = await response.json().catch(() => null);
    setDeleting(false);

    if (!response.ok) {
      setMessage(result?.error || "삭제하지 못했습니다.");
      return;
    }

    abandonPhotoDraft(selected.registry_id);
    const remaining = tutors.filter((tutor) => tutor.registry_id !== selected.registry_id);
    setTutors(remaining);
    setCommittedTutors((current) => current.filter((tutor) => tutor.registry_id !== selected.registry_id));
    activateSelection(remaining[0]?.registry_id ?? "");
    setMessage(`${selected.name} 튜터를 삭제했습니다.`);
  }

  return (
    <main className={styles.page}>
      <AdminSidebar active="tutors" adminName={adminName} styles={styles} />

      <section className={styles.main} id="tutors">
        <header className={styles.heading}>
          <div><p>SUPABASE · LIVE DIRECTORY</p><h1>튜터 명부 관리</h1><span>저장한 정보는 Supabase를 거쳐 공개 웹사이트에 반영됩니다.</span></div>
          <div className={styles.connection}><i /> 데이터베이스 연결됨</div>
        </header>

        <section className={styles.importPanel} aria-labelledby="tutor-import-heading">
          <div className={styles.importHeader}>
            <div>
              <p>EXCEL · BULK CARD BUILDER</p>
              <h2 id="tutor-import-heading">지원자 엑셀로 카드 만들기</h2>
              <span>파일을 읽으면 실제 튜터 찾기 화면과 같은 샌드박스가 열립니다. 승인하기 전에는 어떤 카드도 저장되거나 공개되지 않습니다.</span>
            </div>
            <div className={styles.importButtons}>
              <a href="/seonbae-tutor-card-import-template.xlsx" download>엑셀 양식 다운로드</a>
              <label className={styles.fileButton} aria-disabled={readingWorkbook}>
                {readingWorkbook ? "파일 읽는 중…" : "엑셀 파일 선택"}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={readingWorkbook}
                  onChange={(event) => {
                    void readWorkbook(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          {readingWorkbook && (
            <div className={styles.importSkeleton} aria-label="엑셀 파일을 확인하는 중" aria-live="polite">
              <i /><i /><i />
            </div>
          )}

          {importPreview && !readingWorkbook && (
            <div className={styles.importPreview}>
              <div className={styles.importPreviewHeading}>
                <div><strong>{importPreview.fileName}</strong><span>{importPreview.rows.length}명 인식 · 오류 {importPreview.errors.length}건</span></div>
                <button type="button" onClick={() => { setImportPreview(null); setImportMessage(""); }}>닫기</button>
              </div>

              {importPreview.errors.length ? (
                <ul className={styles.importErrors}>
                  {importPreview.errors.slice(0, 12).map((error, index) => (
                    <li key={`${error.row}-${error.field}-${index}`}>
                      <b>{error.row}행{error.field ? ` · ${error.field}` : ""}</b>
                      <span>{error.message}</span>
                    </li>
                  ))}
                  {importPreview.errors.length > 12 && <li><span>그 외 {importPreview.errors.length - 12}건의 오류가 있습니다.</span></li>}
                </ul>
              ) : null}
            </div>
          )}

          {importMessage && <p className={styles.importMessage} role="status">{importMessage}</p>}
          {!importPreview && !readingWorkbook && !importMessage && (
            <p className={styles.importPrivacy}>원본 엑셀은 이 브라우저에서만 읽습니다. 연락처·이메일·증빙 링크는 카드 미리보기에 포함하지 않습니다.</p>
          )}
        </section>

        <div className={styles.workspace}>
          <aside className={styles.tutorList}>
            <div className={styles.listHeading}><span>등재 튜터</span><b>{tutors.length}</b></div>
            {draft && (
              <button
                type="button"
                className={isDraft ? styles.selectedTutor : ""}
                onClick={() => selectTutor(DRAFT_KEY)}
              >
                <span className={styles.listAvatar}>{draft.name ? initials(draft.name) : "＋"}</span>
                <span><b>{draft.name || "새 튜터 카드"}</b><small>명부 번호 자동 배정 · 저장 전</small></span>
                <i className={styles.hidden} />
              </button>
            )}
            {tutors.map((tutor) => (
              <button
                type="button"
                className={selectedId === tutor.registry_id ? styles.selectedTutor : ""}
                onClick={() => selectTutor(tutor.registry_id)}
                key={tutor.registry_id}
              >
                <span className={styles.listAvatar}>{tutor.photo_url ? <img src={tutor.photo_url} alt="" /> : initials(tutor.name)}</span>
                <span><b>{tutor.name}</b><small>{tutor.roster_number || "명부 번호 대기"} · {tutor.exam}</small></span>
                <i className={tutor.active ? styles.live : styles.hidden} />
              </button>
            ))}
            <button type="button" className={styles.addTutor} onClick={startDraft} disabled={Boolean(draft)}>
              ＋ 카드 추가
            </button>
          </aside>

          {selected ? (
            <div className={styles.editor}>
              <div className={styles.cardPreview} style={selected.banner_url ? { backgroundImage: `${bannerOverlay(selected.banner_url)},url("${selected.banner_url}")` } : undefined}>
                <span className={styles.previewPhoto}>{selected.photo_url ? <img src={selected.photo_url} alt={`${selected.name} 튜터`} /> : <b>{initials(selected.name)}<small>사진 준비 중</small></b>}</span>
                <div><p>{displayRosterNumber}</p><h2>{selected.name}</h2><span>{selected.university || "대학교 미입력"}</span></div>
                <strong>{featuredScore?.score || "—"}<small>{featuredScore?.subject || "과목 성적 미입력"}</small></strong>
              </div>

              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
                <TutorCard
                  tutor={{
                    registryId: selected.registry_id,
                    rosterNumber: selected.roster_number,
                    name: selected.name,
                    university: selected.university,
                    photoUrl: selected.photo_url,
                    exam: selected.exam,
                    score: selected.score,
                    subjectScores: selected.subject_scores,
                    availability: selected.availability,
                    bio: selected.bio,
                    bioEn: selected.bio_en,
                    videoUrl: selected.video_url,
                    languages: selected.languages,
                    lessonFormat: selected.lesson_format,
                  }}
                />
              </div>

              <div className={styles.formGrid}>
                <label><span>명부 번호</span><input value={displayRosterNumber} disabled aria-describedby="roster-number-help" /><small id="roster-number-help" className={styles.fieldHint}>모든 카드에 같은 T-0001 형식으로 자동 배정됩니다.</small></label>
                <label><span>표시 순서 <b className={styles.required}>필수</b></span><input type="number" min="0" max="9999" value={selected.display_order} onChange={(event) => updateSelected("display_order", Number(event.target.value))} /></label>
                <label><span>튜터 이름 <b className={styles.required}>필수</b></span><input required value={selected.name} onChange={(event) => updateSelected("name", event.target.value)} /></label>
                <label><span>시험 / 커리큘럼 <b className={styles.required}>필수</b></span><input required placeholder="예: IB Diploma" value={selected.exam} onChange={(event) => updateSelected("exam", event.target.value)} /></label>
                <label><span>카테고리 <b className={styles.required}>필수</b></span><select value={selected.category} onChange={(event) => updateSelected("category", event.target.value as AdminTutor["category"])}><option value="ib">IB</option><option value="ap">AP</option><option value="alevel">A-Level</option><option value="sat">SAT / ACT</option><option value="english">영어 시험</option></select></label>
                <label><span>대학교 (한국어)</span><input value={selected.university || ""} onChange={(event) => updateSelected("university", event.target.value || null)} /></label>
                <label><span>대학교 (영문)</span><input value={selected.university_en || ""} onChange={(event) => updateSelected("university_en", event.target.value || null)} /></label>
                <label><span>대학교 배너</span><select value={selected.banner_url || ""} onChange={(event) => updateSelected("banner_url", event.target.value || null)}><option value="">배너 없음</option>{bannerOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label><span>Zoom 호스트 이메일</span><input type="email" placeholder="tutor@seonbae.com" value={selected.zoom_host_email || ""} onChange={(event) => updateSelected("zoom_host_email", event.target.value || null)} /></label>
                <div className={`${styles.full} ${styles.photoField}`}>
                  <span className={styles.groupLabel}>튜터 프로필 사진</span>
                  <p className={styles.groupHint}>정사각형 사진을 권장합니다. JPG, PNG 또는 WebP · 최대 4MB</p>
                  <label className={styles.photoUploadButton} aria-disabled={uploadingPhoto}>
                    {uploadingPhoto ? "사진 올리는 중…" : selected.photo_url ? "다른 사진 선택" : "사진 파일 선택"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      disabled={uploadingPhoto}
                      onChange={(event) => {
                        void uploadPhoto(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {selected.photo_url && <span className={styles.photoReady}>사진 미리보기에 반영됨</span>}
                  <details className={styles.photoUrlFallback}>
                    <summary>이미지 주소로 직접 입력</summary>
                    <input type="url" placeholder="https://... 또는 /images/..." value={selected.photo_url || ""} onChange={(event) => usePhotoUrl(event.target.value)} />
                  </details>
                </div>

                <div className={styles.full}>
                  <span className={styles.groupLabel}>과목별 성적 <b className={styles.required}>필수</b></span>
                  <p className={styles.groupHint}>공개 카드에 그대로 표시됩니다. 과목과 해당 성적을 한 개 이상 모두 입력해 주세요.</p>
                  {(selected.subject_scores ?? []).map((row, index) => (
                    <div className={styles.pairRow} key={index}>
                      <input
                        value={row.subject}
                        placeholder="예: IB Economics HL"
                        onChange={(event) => updateScore(index, "subject", event.target.value)}
                      />
                      <input
                        value={row.score}
                        placeholder="예: 7"
                        onChange={(event) => updateScore(index, "score", event.target.value)}
                      />
                      <button type="button" onClick={() => removeScore(index)} aria-label="과목 삭제">×</button>
                    </div>
                  ))}
                  <button type="button" className={styles.addRow} onClick={addScore} disabled={(selected.subject_scores?.length ?? 0) >= 12}>과목 추가</button>
                </div>

                <div className={styles.full}>
                  <span className={styles.groupLabel}>가능 시간</span>
                  <p className={styles.groupHint}>24시간 형식으로 입력하세요. 여러 구간은 쉼표로 구분합니다. 자정까지는 24:00으로 적습니다. 예: 18:00-21:00, 22:00-24:00</p>
                  {DAY_FIELDS.map((day) => (
                    <div className={styles.dayRow} key={day.key}>
                      <span>{day.label}</span>
                      <input
                        value={dayValue(day.key)}
                        placeholder="18:00-21:00"
                        onChange={(event) => updateDay(day.key, event.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <label className={styles.full}><span>소개 (한국어)</span><textarea rows={3} maxLength={600} value={selected.bio || ""} onChange={(event) => updateSelected("bio", event.target.value || null)} /></label>
                <label className={styles.full}><span>소개 (영어)</span><textarea rows={3} maxLength={600} value={selected.bio_en || ""} onChange={(event) => updateSelected("bio_en", event.target.value || null)} /></label>
                <label className={styles.full}><span>샘플 수업 영상 URL</span><input type="url" placeholder="https://www.youtube.com/embed/... 또는 https://.../lesson.mp4" value={selected.video_url || ""} onChange={(event) => updateSelected("video_url", event.target.value || null)} /></label>
                <label><span>언어</span><input placeholder="한국어, 영어" value={selected.languages || ""} onChange={(event) => updateSelected("languages", event.target.value || null)} /></label>
                <label><span>수업 형식</span><input placeholder="온라인 1:1" value={selected.lesson_format || ""} onChange={(event) => updateSelected("lesson_format", event.target.value || null)} /></label>

                <div className={styles.full}>
                  <span className={styles.groupLabel}>연결된 튜터 계정</span>
                  <p className={styles.groupHint}>
                    이 카드를 소유할 계정을 직접 고릅니다. 연결된 계정만 튜터 포털에서 이 카드의 수업, 숙제, 대화를 볼 수 있습니다.
                    이메일이 같다고 자동으로 연결되지는 않습니다.
                  </p>
                  {isDraft ? (
                    <p className={styles.groupHint}>카드를 먼저 만든 뒤 계정을 연결할 수 있습니다.</p>
                  ) : (
                    <div className={styles.assignRow}>
                      <select
                        value={linkedAccount?.id || ""}
                        disabled={assigning}
                        onChange={(event) => assignAccount(event.target.value || null)}
                        aria-label="연결할 튜터 계정"
                      >
                        <option value="">연결 안 함</option>
                        {links.map((account) => (
                          <option
                            value={account.id}
                            key={account.id}
                            disabled={Boolean(account.tutor_registry_id) && account.tutor_registry_id !== selected.registry_id}
                          >
                            {accountLabel(account)}
                            {account.tutor_registry_id && account.tutor_registry_id !== selected.registry_id
                              ? ` · ${tutors.find((tutor) => tutor.registry_id === account.tutor_registry_id)?.roster_number || "다른 카드"} 연결됨`
                              : ""}
                          </option>
                        ))}
                      </select>
                      {linkedAccount && (
                        <button type="button" onClick={() => assignAccount(null)} disabled={assigning}>
                          연결 해제
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <label className={styles.toggle}><input type="checkbox" checked={selected.active} onChange={(event) => updateSelected("active", event.target.checked)} /><span>공개 명부에 표시</span></label>
              </div>

              <footer className={styles.actions}>
                <p className={message.startsWith("저장") || message.includes("만들었습니다") ? styles.success : ""}>
                  {message || (isDraft ? "필수 항목과 과목별 성적을 한 개 이상 입력해 주세요." : "필수 정보와 이미지 설정을 확인한 뒤 저장하세요.")}
                </p>
                <div className={styles.actionButtons}>
                  {isDraft ? (
                    <button type="button" className={styles.deleteButton} onClick={discardDraft} disabled={saving || uploadingPhoto}>
                      취소
                    </button>
                  ) : (
                    <button type="button" className={styles.deleteButton} onClick={deleteTutor} disabled={saving || deleting || uploadingPhoto}>
                      {deleting ? "삭제 중..." : "튜터 삭제"}
                    </button>
                  )}
                  <button type="button" className={styles.applyButton} onClick={saveTutor} disabled={saving || deleting || uploadingPhoto}>
                    {saving ? (isDraft ? "만드는 중..." : "반영 중...") : (isDraft ? "카드 만들기 · Supabase에 반영" : "Supabase에 반영")}
                    <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m6.5 12.5 3.4 3.4 7.6-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  </button>
                </div>
              </footer>
            </div>
          ) : (
            <div className={styles.noTutor}>
              <p>등재된 튜터가 없습니다.</p>
              <button type="button" className={styles.addTutor} onClick={startDraft}>＋ 카드 추가</button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function accountLabel(account: AdminAccount | null | undefined) {
  if (!account) return "계정";
  return `${account.full_name || "이름 없음"} · ${account.email || "이메일 없음"}`;
}

function byDisplayOrder(left: AdminTutor, right: AdminTutor) {
  return left.display_order - right.display_order || left.registry_id.localeCompare(right.registry_id);
}

function initials(value: string) {
  const clean = value.trim();
  if (!clean) return "선";
  return /^[가-힣]/.test(clean) ? clean.slice(-2) : clean.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
}

function bannerOverlay(bannerUrl: string | null) {
  if (bannerUrl === "/university-korea-banner.png") {
    return "linear-gradient(90deg,rgba(86,0,32,.72),rgba(122,0,37,.22))";
  }
  if (bannerUrl === "/university-snu-banner.png") {
    return "linear-gradient(90deg,rgba(2,27,83,.76),rgba(0,51,126,.24))";
  }
  return "linear-gradient(90deg,rgba(1,34,91,.72),rgba(10,63,138,.22))";
}
