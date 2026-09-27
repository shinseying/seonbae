"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePortalText } from "./PortalLocale";
import Spinner from "./Spinner";
import styles from "./bookings.module.css";

export type PortalBooking = {
  id: number;
  tutorRegistryId?: string;
  tutorName: string;
  name: string;
  email: string;
  phone: string | null;
  preferredDay: string | null;
  preferredTime: string | null;
  subject: string | null;
  note: string | null;
  status: string;
  unread: boolean;
  createdAt: string;
  forwardedAt?: string | null;
  decidedAt?: string | null;
};

// Rooms the tutor can put an accepted match into. A room whose seat is taken
// cannot host another student, which is what `hasSeat` marks.
export type ClassroomOption = { id: number; title: string; hasSeat: boolean };

// Tutors the admin can hand a declined match to.
export type RematchTutor = { registryId: string; label: string };

const DAY_KO: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};
const DAY_EN: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

// Shown on both the tutor and the admin portal. `showTutor` adds the tutor
// column, which only the admin needs.
export default function BookingsPanel({
  bookings,
  showTutor = false,
  tutorActions = false,
  classrooms = [],
  rematchTutors = [],
}: {
  bookings: PortalBooking[];
  showTutor?: boolean;
  tutorActions?: boolean;
  classrooms?: ClassroomOption[];
  rematchTutors?: RematchTutor[];
}) {
  const { locale, text: l } = usePortalText();
  const router = useRouter();
  const [items, setItems] = useState(bookings);
  const [forwardingId, setForwardingId] = useState<number | null>(null);
  const unread = items.filter((item) => item.unread).length;

  async function forward(id: number) {
    setForwardingId(id);
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok) {
        setItems((rows) => rows.map((row) => (row.id === id ? { ...row, forwardedAt: result?.forwardedAt || new Date().toISOString() } : row)));
      } else {
        window.alert(result?.error || l("전달하지 못했습니다.", "Could not forward."));
      }
    } finally {
      setForwardingId(null);
    }
  }

  // A declined match comes back here: move it to another tutor, then forward
  // it the usual way so the new tutor gets the email.
  async function rematch(id: number, tutorRegistryId: string) {
    const tutor = rematchTutors.find((option) => option.registryId === tutorRegistryId);
    if (!tutor) {
      window.alert(l("다시 배정할 튜터를 선택해 주세요.", "Choose a tutor to rematch with."));
      return;
    }
    if (!window.confirm(l(`${tutor.label} 튜터에게 이 매칭 요청을 전달할까요?`, `Forward this match request to ${tutor.label}?`))) return;
    setForwardingId(id);
    try {
      const moved = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tutorRegistryId }),
      });
      const movedResult = await moved.json().catch(() => null);
      if (!moved.ok) {
        window.alert(movedResult?.error || l("다시 배정하지 못했습니다.", "Could not reassign."));
        return;
      }
      setItems((rows) => rows.map((row) => (row.id === id
        ? { ...row, tutorRegistryId, tutorName: tutor.label, status: "new", forwardedAt: null }
        : row)));
    } finally {
      setForwardingId(null);
    }
    await forward(id);
  }

  const [decidingId, setDecidingId] = useState<number | null>(null);
  const openRooms = classrooms.filter((room) => !room.hasSeat);

  async function decide(id: number, decision: "accepted" | "declined", classroomId?: number) {
    // Accepting needs somewhere to put them, so say so plainly rather than
    // failing on the server.
    if (decision === "accepted" && !classroomId) {
      window.alert(
        classrooms.length === 0
          ? l("먼저 교실을 만들어 주세요. 내 교실에서 만들 수 있습니다.", "Create a classroom first. You can make one in My classroom.")
          : openRooms.length === 0
            ? l("비어 있는 교실이 없습니다. 내 교실에서 새 교실을 만들어 주세요.", "No classroom has a free seat. Create one in My classroom.")
            : l("배정할 교실을 먼저 선택해 주세요.", "Choose a classroom first."),
      );
      return;
    }
    // Seating a student is not undone from this screen, so name the room and
    // the requester before it happens.
    if (decision === "accepted") {
      const room = openRooms.find((option) => option.id === classroomId);
      const requester = items.find((row) => row.id === id)?.name || l("요청자", "the requester");
      const confirmed = window.confirm(
        l(
          `'${room?.title ?? ""}' 교실에 ${requester} 님을 배정할까요?`,
          `Place ${requester} in the classroom '${room?.title ?? ""}'?`,
        ),
      );
      if (!confirmed) return;
    }
    setDecidingId(id);
    try {
      const response = await fetch("/api/tutor/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, classroomId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        window.alert(result?.error || l("처리하지 못했습니다.", "Could not process."));
        return;
      }
      setItems((rows) => rows.filter((row) => row.id !== id));
      router.refresh();
    } finally {
      setDecidingId(null);
    }
  }

  useEffect(() => setItems(bookings), [bookings]);

  // Clearing on view keeps the badge honest without an extra click.
  useEffect(() => {
    if (!unread) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch("/api/bookings", { method: "PATCH" })
        .then(() => { if (!cancelled) setItems((rows) => rows.map((row) => ({ ...row, unread: false }))); })
        .catch(() => {});
    }, 1500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [unread]);

  return (
    <section className={styles.panel}>
      <header className={styles.head}>
        <div>
          <p>MATCH REQUESTS</p>
          <h2>{l("매칭 요청", "Match requests")}</h2>
        </div>
        {unread > 0 && <span className={styles.badge}>{l(`새 요청 ${unread}건`, `${unread} new`)}</span>}
      </header>

      {items.length === 0 ? (
        <p className={styles.empty}>
          {l("아직 매칭 요청이 없습니다.", "No match requests yet.")}
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} data-unread={item.unread || undefined}>
              <div className={styles.who}>
                <b>{item.name}</b>
                <span>
                  {item.email}
                  {item.phone ? ` · ${item.phone}` : ""}
                </span>
                {item.subject && <span className={styles.subject}>{item.subject}</span>}
                {showTutor && <span className={styles.tutor}>{item.tutorName}</span>}
              </div>
              <div className={styles.when}>
                <b>
                  {item.preferredDay
                    ? `${(locale === "ko" ? DAY_KO : DAY_EN)[item.preferredDay] || item.preferredDay} ${item.preferredTime || ""}`.trim()
                    : l("시간 미지정", "No time given")}
                </b>
                <span>{formatDate(item.createdAt, locale)}</span>
              </div>
              {item.note && <p className={styles.note}>{item.note}</p>}
              {tutorActions && (
                <div className={styles.tutorActions}>
                  {/* No room is preselected: the tutor picks one on purpose. */}
                  <select
                    id={`match-room-${item.id}`}
                    defaultValue=""
                    disabled={openRooms.length === 0}
                    aria-label={l("배정할 교실", "Classroom")}
                  >
                    {openRooms.length ? (
                      <>
                        <option value="" disabled>{l("교실 선택", "Choose a classroom")}</option>
                        {openRooms.map((room) => <option value={room.id} key={room.id}>{room.title}</option>)}
                      </>
                    ) : (
                      <option value="">{l("빈 교실 없음", "No free classroom")}</option>
                    )}
                  </select>
                  {openRooms.length === 0 && (
                    <a className={styles.createRoom} href="/portal/classroom">
                      {l("교실 만들기", "Create a classroom")}
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={decidingId === item.id}
                    onClick={() => {
                      const select = document.getElementById(`match-room-${item.id}`) as HTMLSelectElement | null;
                      const value = Number(select?.value);
                      decide(item.id, "accepted", Number.isInteger(value) && value > 0 ? value : undefined);
                    }}
                  >
                    {decidingId === item.id ? <Spinner label={l("처리 중", "Working")} /> : l("수락", "Accept")}
                  </button>
                  <button
                    type="button"
                    className={styles.declineButton}
                    disabled={decidingId === item.id}
                    onClick={() => decide(item.id, "declined")}
                  >
                    {l("거절", "Decline")}
                  </button>
                </div>
              )}
              {showTutor && item.status === "declined" && (
                <div className={styles.tutorActions}>
                  <span className={styles.declined}>{l("튜터가 거절함 · 다른 튜터를 배정해 주세요", "Declined by the tutor · choose another tutor")}</span>
                  <select id={`rematch-${item.id}`} defaultValue="" aria-label={l("다시 배정할 튜터", "Tutor to rematch with")}>
                    <option value="" disabled>{l("튜터 선택", "Choose a tutor")}</option>
                    {rematchTutors
                      .filter((option) => option.registryId !== item.tutorRegistryId)
                      .map((option) => <option value={option.registryId} key={option.registryId}>{option.label}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={forwardingId === item.id}
                    onClick={() => {
                      const select = document.getElementById(`rematch-${item.id}`) as HTMLSelectElement | null;
                      void rematch(item.id, select?.value || "");
                    }}
                  >
                    {forwardingId === item.id ? <Spinner label={l("전달 중", "Forwarding")} /> : l("다른 튜터에게 전달", "Forward to another tutor")}
                  </button>
                </div>
              )}
              {showTutor && item.status === "accepted" && (
                <span className={styles.forwarded}>{l("튜터가 수락함", "Accepted by the tutor")}</span>
              )}
              {showTutor && item.status !== "declined" && item.status !== "accepted" && (
                item.forwardedAt ? (
                  <span className={styles.forwarded}>{l("튜터에게 전달됨", "Forwarded to tutor")}</span>
                ) : (
                  <button
                    type="button"
                    className={styles.forwardButton}
                    onClick={() => forward(item.id)}
                    disabled={forwardingId === item.id}
                  >
                    {forwardingId === item.id ? <Spinner label={l("전달 중", "Forwarding")} /> : l("튜터에게 전달", "Forward to tutor")}
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatDate(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
