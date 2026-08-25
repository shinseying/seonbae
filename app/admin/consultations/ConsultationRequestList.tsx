"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./consultations.module.css";

export type AdminConsultationRequest = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  curriculum: string;
  preferred_tutor: string | null;
  preferred_times: string | null;
  subject: string;
  goals: string;
  language: "ko" | "en";
  source: "website" | "footer";
  status: "new" | "contacted" | "closed";
  notification_sent_at: string | null;
  notification_error: string | null;
  created_at: string;
};

export type AdminScheduledConsultation = AdminConsultationRequest & {
  user_id: string | null;
  session_date: string;
  starts_at: string;
  duration_minutes: number;
  meeting_title: string | null;
  notes: string | null;
  zoom_meeting_number: string;
  zoom_status: string;
};

export default function ConsultationRequestList({
  requests,
  scheduled,
}: {
  requests: AdminConsultationRequest[];
  scheduled: AdminScheduledConsultation[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const [scheduling, setScheduling] = useState<number | null>(null);

  // Confirming turns the inquiry itself into the consultation, so it leaves
  // this list and appears under 확정된 상담 일정 below.
  async function schedule(request: AdminConsultationRequest, form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(request.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          sessionDate: data.get("sessionDate"),
          startsAt: data.get("startsAt"),
          durationMinutes: Number(data.get("durationMinutes")),
          topic: request.subject || "학습 방향 상담",
          title: String(data.get("title") || "").trim() || "보호자 상담",
          notes: data.get("notes"),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error || "상담 일정을 확정하지 못했습니다.");
        return;
      }
      setScheduling(null);
      router.refresh();
    } catch {
      setMessage("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function updateStatus(id: number, status: AdminConsultationRequest["status"]) {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/consultation-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "상담 상태를 저장하지 못했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setMessage("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.requestList}>
      {message && <p className={styles.message} role="alert">{message}</p>}
      {requests.length ? requests.map((request) => (
        <article key={request.id}>
          <header>
            <div>
              <small>#{request.id} · {request.curriculum} · {request.source === "footer" ? "빠른 상담" : "상담 페이지"}</small>
              <h2>{request.name} · {request.subject}</h2>
              <p><a href={`mailto:${request.email}`}>{request.email}</a>{request.phone ? ` · ${request.phone}` : ""}</p>
            </div>
            <div className={styles.meta}>
              <time>{formatDate(request.created_at)}</time>
              <span data-status={request.status}>{statusLabel(request.status)}</span>
            </div>
          </header>
          <dl>
            <div><dt>희망 튜터</dt><dd>{request.preferred_tutor || "팀 추천"}</dd></div>
            <div><dt>상담 가능 시간</dt><dd>{request.preferred_times || "미선택"}</dd></div>
            <div><dt>언어</dt><dd>{request.language === "ko" ? "한국어" : "English"}</dd></div>
            <div><dt>이메일</dt><dd className={request.notification_sent_at ? styles.sent : styles.warning}>{request.notification_sent_at ? "전송 완료" : `전송 실패 · ${request.notification_error || "설정 확인 필요"}`}</dd></div>
          </dl>
          <div className={styles.goals}><b>목표와 현재 상황</b><p>{request.goals}</p></div>
          <footer>
            <a href={`mailto:${request.email}?subject=${encodeURIComponent(`[선배 상담 #${request.id}] 답변`)}`}>이메일 답장</a>
            <div>
              <button type="button" className={styles.scheduleToggle} onClick={() => setScheduling(scheduling === request.id ? null : request.id)}>
                {scheduling === request.id ? "닫기" : "상담 일정 확정"}
              </button>
              {request.status !== "new" && <button type="button" disabled={busy === request.id} onClick={() => updateStatus(request.id, "new")}>신규로 되돌리기</button>}
              {request.status !== "contacted" && <button type="button" disabled={busy === request.id} onClick={() => updateStatus(request.id, "contacted")}>연락 완료</button>}
              {request.status !== "closed" && <button type="button" disabled={busy === request.id} onClick={() => updateStatus(request.id, "closed")}>종결</button>}
            </div>
          </footer>

          {scheduling === request.id && (
            <form
              className={styles.scheduleForm}
              onSubmit={(event) => { event.preventDefault(); schedule(request, event.currentTarget); }}
            >
              <label><span>상담 날짜</span><input type="date" name="sessionDate" required /></label>
              <label>
                <span>시작 시각</span>
                <select name="startsAt" required defaultValue="19:00">
                  {EVENING_SLOTS.map((slot) => <option value={slot} key={slot}>{slot}</option>)}
                </select>
              </label>
              <label>
                <span>상담 시간</span>
                <select name="durationMinutes" defaultValue="45">
                  <option value="30">30분</option>
                  <option value="45">45분</option>
                  <option value="60">60분</option>
                </select>
              </label>
              <label className={styles.scheduleWide}><span>상담 제목</span><input name="title" defaultValue="보호자 상담" maxLength={160} /></label>
              <label className={styles.scheduleWide}><span>전달 사항</span><textarea name="notes" rows={2} maxLength={1000} /></label>
              <button type="submit" disabled={busy === request.id}>
                {busy === request.id ? "확정 중…" : "확정하고 안내 메일 보내기"}
              </button>
              <p className={styles.scheduleHint}>확정하면 신청자에게 Zoom 링크가 담긴 안내 메일이 발송됩니다. 계정이 없어도 참여할 수 있습니다.</p>
            </form>
          )}
        </article>
      )) : <div className={styles.empty}>접수된 상담 신청이 없습니다.</div>}

      <section className={styles.scheduledSection}>
        <h2>확정된 상담 일정</h2>
        {scheduled.length ? scheduled.map((item) => (
          <article className={styles.scheduledCard} key={item.id}>
            <div>
              <b>{item.meeting_title || item.subject}</b>
              <small>{item.name}{item.email ? ` · ${item.email}` : ""}{item.user_id ? "" : " · 계정 없음"}</small>
            </div>
            <time>{item.session_date} {item.starts_at?.slice(0, 5)} · {item.duration_minutes}분</time>
            <span data-zoom={item.zoom_status}>{zoomLabel(item.zoom_status)}</span>
          </article>
        )) : <div className={styles.empty}>확정된 상담 일정이 없습니다.</div>}
      </section>
    </div>
  );
}

const EVENING_SLOTS = ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"];

function zoomLabel(status: string) {
  if (status === "scheduled") return "예정";
  if (status === "live") return "진행 중";
  if (status === "ended") return "종료";
  if (status === "cancelled") return "취소";
  return status;
}

function statusLabel(status: AdminConsultationRequest["status"]) {
  if (status === "contacted") return "연락 완료";
  if (status === "closed") return "종결";
  return "신규";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
