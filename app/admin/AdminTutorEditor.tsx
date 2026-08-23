"use client";

import { useState } from "react";
import AdminSidebar from "./AdminSidebar";
import styles from "./admin.module.css";

export type AdminTutor = {
  registry_id: string;
  name: string;
  exam: string;
  score: string;
  category: "ib" | "ap" | "alevel" | "sat" | "english";
  tier: "premium" | "standard";
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

const bannerOptions = [
  { value: "/university-korea-banner.png", label: "고려대학교 배너" },
  { value: "/university-snu-banner.png", label: "서울대학교 배너" },
  { value: "/university-yonsei-banner.png", label: "연세대학교 배너" },
];

export default function AdminTutorEditor({ adminName, initialTutors }: { adminName: string; initialTutors: AdminTutor[] }) {
  const [tutors, setTutors] = useState(initialTutors);
  const [selectedId, setSelectedId] = useState(initialTutors[0]?.registry_id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selected = tutors.find((tutor) => tutor.registry_id === selectedId) ?? null;

  function updateSelected<K extends keyof AdminTutor>(key: K, value: AdminTutor[K]) {
    setTutors((current) => current.map((tutor) => tutor.registry_id === selectedId ? { ...tutor, [key]: value } : tutor));
    setMessage("");
  }

  async function saveTutor() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/tutors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selected),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "저장하지 못했습니다.");
      setSaving(false);
      return;
    }
    setTutors((current) => current.map((tutor) => tutor.registry_id === selectedId ? result : tutor));
    setMessage("저장되었습니다. 공개 튜터 명부에도 바로 반영됩니다.");
    setSaving(false);
  }

  return (
    <main className={styles.page}>
      <AdminSidebar active="tutors" adminName={adminName} styles={styles} />

      <section className={styles.main} id="tutors">
        <header className={styles.heading}>
          <div><p>SUPABASE · LIVE DIRECTORY</p><h1>튜터 명부 관리</h1><span>저장한 정보는 Supabase를 거쳐 공개 웹사이트에 반영됩니다.</span></div>
          <div className={styles.connection}><i /> 데이터베이스 연결됨</div>
        </header>

        <div className={styles.workspace}>
          <aside className={styles.tutorList}>
            <div className={styles.listHeading}><span>등재 튜터</span><b>{tutors.length}</b></div>
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
          </aside>

          {selected ? (
            <div className={styles.editor}>
              <div className={styles.cardPreview} style={selected.banner_url ? { backgroundImage: `${bannerOverlay(selected.banner_url)},url("${selected.banner_url}")` } : undefined}>
                <span className={styles.previewPhoto}>{selected.photo_url ? <img src={selected.photo_url} alt={`${selected.name} 튜터`} /> : <b>{initials(selected.name)}<small>사진 준비 중</small></b>}</span>
                <div><p>{selected.registry_id} · {selected.tier.toUpperCase()}</p><h2>{selected.name}</h2><span>{selected.university || "대학교 미입력"}</span></div>
                <strong>{selected.score}<small>{selected.exam}</small></strong>
              </div>

              <div className={styles.formGrid}>
                <label><span>명부 번호</span><input value={selected.registry_id} disabled /></label>
                <label><span>표시 순서</span><input type="number" min="0" max="9999" value={selected.display_order} onChange={(event) => updateSelected("display_order", Number(event.target.value))} /></label>
                <label><span>튜터 이름</span><input value={selected.name} onChange={(event) => updateSelected("name", event.target.value)} /></label>
                <label><span>시험 / 커리큘럼</span><input value={selected.exam} onChange={(event) => updateSelected("exam", event.target.value)} /></label>
                <label><span>검증 성적</span><input value={selected.score} onChange={(event) => updateSelected("score", event.target.value)} /></label>
                <label><span>카테고리</span><select value={selected.category} onChange={(event) => updateSelected("category", event.target.value as AdminTutor["category"])}><option value="ib">IB</option><option value="ap">AP</option><option value="alevel">A-Level</option><option value="sat">SAT / ACT</option><option value="english">영어 시험</option></select></label>
                <label><span>등급</span><select value={selected.tier} onChange={(event) => updateSelected("tier", event.target.value as AdminTutor["tier"])}><option value="premium">Premium</option><option value="standard">Standard</option></select></label>
                <label><span>대학교 (한국어)</span><input value={selected.university || ""} onChange={(event) => updateSelected("university", event.target.value || null)} /></label>
                <label><span>대학교 (영문)</span><input value={selected.university_en || ""} onChange={(event) => updateSelected("university_en", event.target.value || null)} /></label>
                <label><span>대학교 배너</span><select value={selected.banner_url || ""} onChange={(event) => updateSelected("banner_url", event.target.value || null)}><option value="">배너 없음</option>{bannerOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label><span>Zoom 호스트 이메일</span><input type="email" placeholder="tutor@seonbae.com" value={selected.zoom_host_email || ""} onChange={(event) => updateSelected("zoom_host_email", event.target.value || null)} /></label>
                <label className={styles.full}><span>튜터 사진 URL</span><input type="url" placeholder="https://... 또는 /images/..." value={selected.photo_url || ""} onChange={(event) => updateSelected("photo_url", event.target.value || null)} /></label>
                <label className={styles.toggle}><input type="checkbox" checked={selected.active} onChange={(event) => updateSelected("active", event.target.checked)} /><span>공개 명부에 표시</span></label>
              </div>

              <footer className={styles.actions}>
                <p className={message.startsWith("저장") ? styles.success : ""}>{message || "필수 정보와 이미지 설정을 확인한 뒤 저장하세요."}</p>
                <button type="button" onClick={saveTutor} disabled={saving}>{saving ? "저장 중..." : "Supabase에 저장"} <span>↗</span></button>
              </footer>
            </div>
          ) : <div className={styles.noTutor}>관리할 튜터가 없습니다.</div>}
        </div>
      </section>
    </main>
  );
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
