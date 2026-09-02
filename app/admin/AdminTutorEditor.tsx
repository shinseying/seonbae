"use client";

import { useState } from "react";
import AdminSidebar from "./AdminSidebar";
import TutorCard from "../portal/TutorCard";
import {
  parseTutorSpreadsheet,
  type TutorImportError,
  type TutorImportRow,
} from "../../utils/tutors/excel-import";
import styles from "./admin.module.css";

export type AdminTutor = {
  registry_id: string;
  name: string;
  exam: string;
  score: string;
  category: "ib" | "ap" | "alevel" | "sat" | "english";
  university: string | null;
  university_en: string | null;
  photo_url: string | null;
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

type ImportPreview = {
  fileName: string;
  rows: TutorImportRow[];
  errors: TutorImportError[];
};

function emptyTutor(registryId: string, displayOrder: number): AdminTutor {
  return {
    registry_id: registryId,
    name: "",
    exam: "",
    score: "",
    category: "ib",
    university: null,
    university_en: null,
    photo_url: null,
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

// Registry numbers on manually added cards run P-001, P-002, ... Suggest the
// next free one; the admin can still type something else.
function nextRegistryId(tutors: AdminTutor[]) {
  const used = tutors
    .map((tutor) => /^P-(\d+)$/.exec(tutor.registry_id)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = used.length ? Math.max(...used) + 1 : 1;
  return `P-${String(next).padStart(3, "0")}`;
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
  const [links, setLinks] = useState(accounts);
  // The availability inputs are free text, but the model behind them is an
  // array. Round-tripping through split/join ate the comma the moment it was
  // typed, so the typed text is held here and only parsed into the array.
  const [dayText, setDayText] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState(false);
  const [draft, setDraft] = useState<AdminTutor | null>(null);
  const [selectedId, setSelectedId] = useState(initialTutors[0]?.registry_id ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [readingWorkbook, setReadingWorkbook] = useState(false);
  const [importingWorkbook, setImportingWorkbook] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const isDraft = selectedId === DRAFT_KEY;
  const selected = isDraft ? draft : tutors.find((tutor) => tutor.registry_id === selectedId) ?? null;
  const linkedAccount = selected && !isDraft
    ? links.find((account) => account.tutor_registry_id === selected.registry_id) ?? null
    : null;

  function updateSelected<K extends keyof AdminTutor>(key: K, value: AdminTutor[K]) {
    if (isDraft) setDraft((current) => current && { ...current, [key]: value });
    else setTutors((current) => current.map((tutor) => tutor.registry_id === selectedId ? { ...tutor, [key]: value } : tutor));
    setMessage("");
  }

  function startDraft() {
    const order = tutors.reduce((max, tutor) => Math.max(max, tutor.display_order), 0) + 1;
    setDraft(emptyTutor(nextRegistryId(tutors), order));
    setSelectedId(DRAFT_KEY);
    setMessage("빈 카드입니다. 이름, 시험, 성적을 채운 뒤 저장하세요.");
  }

  function discardDraft() {
    setDraft(null);
    setSelectedId(tutors[0]?.registry_id ?? "");
    setMessage("");
  }

  function updateScore(index: number, key: "subject" | "score", value: string) {
    const rows = [...(selected?.subject_scores ?? [])];
    rows[index] = { ...rows[index], [key]: value };
    updateSelected("subject_scores", rows);
  }
  function addScore() {
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
        existingRegistryIds: tutors.map((tutor) => tutor.registry_id),
        maxDisplayOrder: tutors.reduce((max, tutor) => Math.max(max, tutor.display_order), 0),
      });
      setImportPreview({ fileName: file.name, ...parsed });
      setImportMessage(parsed.errors.length
        ? "표시된 항목을 엑셀에서 고친 뒤 파일을 다시 선택해 주세요."
        : `${parsed.rows.length}명의 카드가 준비되었습니다. 아래 미리보기를 확인해 주세요.`);
    } catch (error) {
      console.error("[tutor workbook]", error);
      setImportMessage("엑셀 파일을 읽지 못했습니다. 잠겨 있거나 손상되지 않았는지 확인해 주세요.");
    } finally {
      setReadingWorkbook(false);
    }
  }

  async function importCards() {
    if (!importPreview || importPreview.errors.length || !importPreview.rows.length) return;
    const currentIds = new Set(tutors.map((tutor) => tutor.registry_id));
    const updateCount = importPreview.rows.filter((row) => currentIds.has(row.registry_id)).length;
    const createCount = importPreview.rows.length - updateCount;
    const summary = [createCount && `새 카드 ${createCount}개`, updateCount && `기존 카드 수정 ${updateCount}개`]
      .filter(Boolean)
      .join(", ");
    if (!window.confirm(`${summary}를 Supabase에 저장할까요?`)) return;

    setImportingWorkbook(true);
    setImportMessage("");
    try {
      const response = await fetch("/api/admin/tutors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importPreview.rows }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setImportMessage(result?.error || "튜터 카드를 저장하지 못했습니다.");
        return;
      }

      const imported = Array.isArray(result?.tutors) ? result.tutors as AdminTutor[] : [];
      setTutors((current) => {
        const merged = new Map(current.map((tutor) => [tutor.registry_id, tutor]));
        imported.forEach((tutor) => merged.set(tutor.registry_id, tutor));
        return [...merged.values()].sort(byDisplayOrder);
      });
      if (imported[0]) setSelectedId(imported[0].registry_id);
      setDraft(null);
      setDayText({});
      setImportPreview(null);
      setImportMessage(`${summary}를 저장했습니다. 공개 여부가 TRUE인 카드는 사이트 명부에도 바로 표시됩니다.`);
    } catch (error) {
      console.error("[tutor card import]", error);
      setImportMessage("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setImportingWorkbook(false);
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
    setDayText({});
    if (isDraft) {
      setTutors((current) => [...current, result].sort(byDisplayOrder));
      setDraft(null);
      setSelectedId(result.registry_id);
      setMessage(`${result.name} 튜터 카드를 만들었습니다. ${result.active ? "공개 명부에 바로 표시됩니다." : "‘공개 명부에 표시’를 켜면 사이트에 나타납니다."}`);
    } else {
      setTutors((current) => current.map((tutor) => tutor.registry_id === selectedId ? result : tutor));
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
    const target = profileId ? links.find((account) => account.id === profileId) : null;
    if (!profileId && !window.confirm(`${selected.name} (${registryId}) 카드의 계정 연결을 해제할까요? 해당 계정은 학생으로 돌아갑니다.`)) {
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
      ? `${accountLabel(target)} 계정에 ${registryId} 카드를 연결했습니다.`
      : `${registryId} 카드의 계정 연결을 해제했습니다.`);
  }

  async function deleteTutor() {
    if (!selected) return;
    if (!window.confirm(`${selected.name} (${selected.registry_id}) 튜터 카드를 삭제할까요? 공개 명부에서 즉시 사라지며 되돌릴 수 없습니다.`)) {
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

    const remaining = tutors.filter((tutor) => tutor.registry_id !== selected.registry_id);
    setTutors(remaining);
    setSelectedId(remaining[0]?.registry_id ?? "");
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
              <span>양식에 정보를 채우면 카드 내용을 자동으로 검사하고, 저장 전 새 카드와 수정될 카드를 미리 보여줍니다.</span>
            </div>
            <div className={styles.importButtons}>
              <a href="/seonbae-tutor-card-import-template.xlsx" download>엑셀 양식 다운로드</a>
              <label className={styles.fileButton} aria-disabled={readingWorkbook || importingWorkbook}>
                {readingWorkbook ? "파일 읽는 중…" : "엑셀 파일 선택"}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={readingWorkbook || importingWorkbook}
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
                <button type="button" onClick={() => { setImportPreview(null); setImportMessage(""); }} disabled={importingWorkbook}>닫기</button>
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
              ) : (
                <div className={styles.importTableWrap}>
                  <table>
                    <thead><tr><th>처리</th><th>명부 번호</th><th>튜터</th><th>학교</th><th>시험 · 성적</th><th>공개</th></tr></thead>
                    <tbody>
                      {importPreview.rows.map((row) => {
                        const updating = tutors.some((tutor) => tutor.registry_id === row.registry_id);
                        return (
                          <tr key={row.registry_id}>
                            <td><span className={updating ? styles.updateBadge : styles.createBadge}>{updating ? "수정" : "신규"}</span></td>
                            <td><b>{row.registry_id}</b><small>엑셀 {row.sourceRow}행</small></td>
                            <td>{row.name}</td>
                            <td>{row.university || "—"}</td>
                            <td>{row.exam}<small>{row.score}</small></td>
                            <td>{row.active ? "공개" : "비공개"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!importPreview.errors.length && (
                <div className={styles.importConfirm}>
                  <p>기존 명부 번호는 해당 카드 전체를 수정하며 엑셀의 빈칸도 반영됩니다. 비어 있는 명부 번호와 표시 순서는 자동으로 채웠습니다.</p>
                  <button type="button" onClick={importCards} disabled={importingWorkbook}>
                    {importingWorkbook ? "카드 저장 중…" : `${importPreview.rows.length}명 카드 생성·반영`}
                  </button>
                </div>
              )}
            </div>
          )}

          {importMessage && <p className={styles.importMessage} role="status">{importMessage}</p>}
          {!importPreview && !readingWorkbook && !importMessage && (
            <p className={styles.importPrivacy}>원본 엑셀은 이 브라우저에서만 읽습니다. 확인 후 카드에 필요한 값만 서버로 전송됩니다.</p>
          )}
        </section>

        <div className={styles.workspace}>
          <aside className={styles.tutorList}>
            <div className={styles.listHeading}><span>등재 튜터</span><b>{tutors.length}</b></div>
            {draft && (
              <button
                type="button"
                className={isDraft ? styles.selectedTutor : ""}
                onClick={() => { setSelectedId(DRAFT_KEY); setMessage(""); }}
              >
                <span className={styles.listAvatar}>{draft.name ? initials(draft.name) : "＋"}</span>
                <span><b>{draft.name || "새 튜터 카드"}</b><small>{draft.registry_id} · 저장 전</small></span>
                <i className={styles.hidden} />
              </button>
            )}
            {tutors.map((tutor) => (
              <button
                type="button"
                className={selectedId === tutor.registry_id ? styles.selectedTutor : ""}
                onClick={() => { setSelectedId(tutor.registry_id); setMessage(""); }}
                key={tutor.registry_id}
              >
                <span className={styles.listAvatar}>{tutor.photo_url ? <img src={tutor.photo_url} alt="" /> : initials(tutor.name)}</span>
                <span><b>{tutor.name}</b><small>{tutor.registry_id} · {tutor.exam}</small></span>
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
                <div><p>{selected.registry_id}</p><h2>{selected.name}</h2><span>{selected.university || "대학교 미입력"}</span></div>
                <strong>{selected.score}<small>{selected.exam}</small></strong>
              </div>

              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
                <TutorCard
                  tutor={{
                    registryId: selected.registry_id,
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
                <label><span>명부 번호</span><input value={selected.registry_id} disabled={!isDraft} placeholder="P-004" onChange={(event) => updateSelected("registry_id", event.target.value.toUpperCase())} /></label>
                <label><span>표시 순서</span><input type="number" min="0" max="9999" value={selected.display_order} onChange={(event) => updateSelected("display_order", Number(event.target.value))} /></label>
                <label><span>튜터 이름</span><input value={selected.name} onChange={(event) => updateSelected("name", event.target.value)} /></label>
                <label><span>시험 / 커리큘럼</span><input value={selected.exam} onChange={(event) => updateSelected("exam", event.target.value)} /></label>
                <label><span>검증 성적</span><input value={selected.score} onChange={(event) => updateSelected("score", event.target.value)} /></label>
                <label><span>카테고리</span><select value={selected.category} onChange={(event) => updateSelected("category", event.target.value as AdminTutor["category"])}><option value="ib">IB</option><option value="ap">AP</option><option value="alevel">A-Level</option><option value="sat">SAT / ACT</option><option value="english">영어 시험</option></select></label>
                                <label><span>대학교 (한국어)</span><input value={selected.university || ""} onChange={(event) => updateSelected("university", event.target.value || null)} /></label>
                <label><span>대학교 (영문)</span><input value={selected.university_en || ""} onChange={(event) => updateSelected("university_en", event.target.value || null)} /></label>
                <label><span>대학교 배너</span><select value={selected.banner_url || ""} onChange={(event) => updateSelected("banner_url", event.target.value || null)}><option value="">배너 없음</option>{bannerOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label><span>Zoom 호스트 이메일</span><input type="email" placeholder="tutor@seonbae.com" value={selected.zoom_host_email || ""} onChange={(event) => updateSelected("zoom_host_email", event.target.value || null)} /></label>
                <label className={styles.full}><span>튜터 사진 URL</span><input type="url" placeholder="https://... 또는 /images/..." value={selected.photo_url || ""} onChange={(event) => updateSelected("photo_url", event.target.value || null)} /></label>

                <div className={styles.full}>
                  <span className={styles.groupLabel}>과목별 성적</span>
                  <p className={styles.groupHint}>튜터 카드의 성적 배지로 표시됩니다. 비워 두면 위의 시험·검증 성적이 대신 표시됩니다.</p>
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
                  <button type="button" className={styles.addRow} onClick={addScore}>과목 추가</button>
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
                              ? ` · ${account.tutor_registry_id} 연결됨`
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
                  {message || (isDraft ? "이름, 시험, 성적은 반드시 입력해야 합니다." : "필수 정보와 이미지 설정을 확인한 뒤 저장하세요.")}
                </p>
                <div className={styles.actionButtons}>
                  {isDraft ? (
                    <button type="button" className={styles.deleteButton} onClick={discardDraft} disabled={saving}>
                      취소
                    </button>
                  ) : (
                    <button type="button" className={styles.deleteButton} onClick={deleteTutor} disabled={saving || deleting}>
                      {deleting ? "삭제 중..." : "튜터 삭제"}
                    </button>
                  )}
                  <button type="button" onClick={saveTutor} disabled={saving || deleting}>
                    {saving ? (isDraft ? "만드는 중..." : "저장 중...") : (isDraft ? "카드 만들기" : "Supabase에 저장")} <span>↗</span>
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
