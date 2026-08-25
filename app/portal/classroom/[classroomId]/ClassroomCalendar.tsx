"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Spinner from "../../Spinner";
import styles from "../classroom.module.css";

export type CalendarLesson = {
  id: number;
  date: string;
  startsAt: string;
  title: string;
  subject: string;
  status: string;
  cancellationReason: string | null;
};

// The classroom's own month view. A scheduled lesson is a button: pressing it
// opens the cancellation form for that date.
export default function ClassroomCalendar({ lessons }: { lessons: CalendarLesson[] }) {
  const router = useRouter();
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<CalendarLesson | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarLesson[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.date) ?? [];
      list.push(lesson);
      map.set(lesson.date, list);
    }
    return map;
  }, [lessons]);

  const cells = useMemo(() => {
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const out: Array<{ key: string; day: number | null; iso: string }> = [];
    for (let i = 0; i < firstWeekday; i += 1) out.push({ key: `pad-${i}`, day: null, iso: "" });
    for (let day = 1; day <= days; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      out.push({ key: iso, day, iso });
    }
    return out;
  }, [monthStart]);

  function shiftMonth(delta: number) {
    setMonthStart((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  async function fileCancellation() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/classroom/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selected.id, reason }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error || "취소를 신청하지 못했습니다.");
        return;
      }
      setSelected(null);
      setReason("");
      router.refresh();
    } catch {
      setMessage("네트워크를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const monthLabel = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(monthStart);

  return (
    <section className={styles.block}>
      <h3>수업 일정</h3>
      <p className={styles.blockEmpty}>예정된 수업 날짜를 누르면 취소를 신청할 수 있습니다.</p>

      <div className={styles.calHead}>
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달">←</button>
        <b>{monthLabel}</b>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달">→</button>
      </div>

      <div className={styles.calGrid} role="grid">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <span className={styles.calDow} key={day}>{day}</span>
        ))}
        {cells.map((cell) => {
          const dayLessons = cell.iso ? byDate.get(cell.iso) ?? [] : [];
          const live = dayLessons.filter((lesson) => lesson.status !== "cancelled");
          return (
            <div className={styles.calCell} key={cell.key} data-empty={cell.day ? undefined : "true"}>
              {cell.day && <span className={styles.calDay}>{cell.day}</span>}
              {dayLessons.map((lesson) => (
                lesson.status === "cancelled" ? (
                  <span className={styles.calCancelled} key={lesson.id} title={lesson.cancellationReason || undefined}>
                    {lesson.startsAt.slice(0, 5)} 취소됨
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.calLesson}
                    key={lesson.id}
                    onClick={() => { setSelected(lesson); setMessage(""); }}
                  >
                    {lesson.startsAt.slice(0, 5)} {lesson.subject}
                  </button>
                )
              ))}
              {cell.day && live.length === 0 && dayLessons.length === 0 && <span className={styles.calNone} />}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className={styles.cancelBox}>
          <b>{selected.date} {selected.startsAt.slice(0, 5)} · {selected.title}</b>
          <label>
            <span>취소 사유</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="취소가 필요한 이유를 적어 주세요."
            />
          </label>
          {message && <p className={styles.toolMessage} data-tone="error" role="status">{message}</p>}
          <div className={styles.cancelActions}>
            <button type="button" onClick={fileCancellation} disabled={busy || reason.trim().length < 2}>
              {busy ? <Spinner label="신청 중" /> : "수업 취소 신청"}
            </button>
            <button
              type="button"
              className={styles.cancelGhost}
              onClick={() => { setSelected(null); setReason(""); setMessage(""); }}
              disabled={busy}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
