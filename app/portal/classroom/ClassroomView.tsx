"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Spinner from "../Spinner";
import { usePortalText } from "../PortalLocale";
import styles from "./classroom.module.css";

export type Classroom = {
  id: number;
  title: string;
  /** Empty until a lesson or the match request names one. */
  subject: string;
  /** Empty while the seat is free; the tutor's match dropdown needs it. */
  studentName: string;
  /** When the newest unseen change happened, null when nothing is new. */
  updatedAt: string | null;
};

// Going back to this list restores the cached page, which still carries the
// dot for the room just visited. The value is the update that was opened, so a
// newer one still shows.
const openedUpdates = new Map<number, string>();

export type MatchRequest = {
  id: number;
  name: string;
  email: string;
  subject: string | null;
  preferredDay: string | null;
  preferredTime: string | null;
  note: string | null;
  createdAt: string;
};

export default function ClassroomView({
  role,
  classrooms,
  matchRequests = [],
  classroomLimit = 3,
  slotRequestPending = false,
}: {
  role: "student" | "parent" | "tutor";
  classrooms: Classroom[];
  matchRequests?: MatchRequest[];
  classroomLimit?: number;
  slotRequestPending?: boolean;
}) {
  const { text: l } = usePortalText();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/classroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: form.get("code"), password: form.get("password") }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error || l("참여 요청을 보내지 못했습니다.", "Could not send the request."));
        return;
      }
      setMessage(l("참여 요청을 보냈습니다. 튜터가 수락하면 교실이 열립니다.", "Request sent. The classroom opens once the tutor accepts."));
      router.refresh();
    } catch {
      setMessage(l("네트워크를 확인해 주세요.", "Check your connection."));
    } finally {
      setBusy(false);
    }
  }

  const atLimit = classrooms.length >= classroomLimit;

  async function post(url: string, payload: unknown, method = "POST") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error || l("처리하지 못했습니다.", "Could not process."));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMessage(l("네트워크를 확인해 주세요.", "Check your connection."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await post("/api/tutor/classrooms", { title: form.get("title") });
    if (ok) setMessage(l("교실을 만들었습니다.", "Classroom created."));
  }

  async function requestSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await post("/api/tutor/classrooms", { reason: form.get("reason") }, "PUT");
    if (ok) setMessage(l("관리자에게 요청을 보냈습니다.", "Request sent to the admin."));
  }

  async function decideMatch(id: number, decision: "accepted" | "declined", classroomId?: number) {
    await post("/api/tutor/bookings", { id, decision, classroomId }, "PATCH");
  }

  // A classroom seats one student; the rest can only take parents.
  const openRooms = classrooms.filter((room) => !room.studentName);

  return (
    <section className={`${styles.shell} ${styles.listShell}`}>
      <header className={styles.heading}>
        <p>MY CLASSROOM</p>
        <h1>{l("내 교실", "My classroom")}</h1>
        <span>
          {l(
            "수업 일정, 숙제와 피드백, 수업 녹화본을 교실 안에서 함께 봅니다.",
            "Lessons, homework and feedback, and recordings all live inside the classroom.",
          )}
        </span>
      </header>

      {role !== "parent" && message && <p className={styles.message} role="status">{message}</p>}

      {role === "tutor" && matchRequests.length > 0 && (
        <section className={styles.requests}>
          <h2>{l("매칭 요청", "Match requests")}</h2>
          {matchRequests.map((request) => (
            <article key={request.id} className={styles.matchRow}>
              <div>
                <b>{request.name}</b>
                <small>
                  {request.email}
                  {request.subject ? ` · ${request.subject}` : ""}
                  {request.preferredDay ? ` · ${request.preferredDay} ${request.preferredTime || ""}` : ""}
                </small>
                {request.note && <p className={styles.matchNote}>{request.note}</p>}
              </div>
              <div className={styles.requestActions}>
                {/* Only rooms with a free seat, and none preselected: the
                    tutor picks one on purpose. */}
                <select
                  defaultValue=""
                  id={`match-room-${request.id}`}
                  aria-label={l("배정할 교실", "Classroom")}
                  disabled={openRooms.length === 0}
                >
                  {openRooms.length ? (
                    <>
                      <option value="" disabled>{l("교실 선택", "Choose a classroom")}</option>
                      {openRooms.map((room) => (
                        <option value={room.id} key={room.id}>{room.title}</option>
                      ))}
                    </>
                  ) : (
                    <option value="">{l("빈 교실 없음 · 아래에서 만들기", "No free classroom · create one below")}</option>
                  )}
                </select>
                <button
                  type="button"
                  disabled={busy || openRooms.length === 0}
                  onClick={() => {
                    const select = document.getElementById(`match-room-${request.id}`) as HTMLSelectElement | null;
                    const room = openRooms.find((option) => option.id === Number(select?.value));
                    if (!room) {
                      setMessage(l("배정할 교실을 먼저 선택해 주세요.", "Choose a classroom first."));
                      return;
                    }
                    if (!window.confirm(l(
                      `'${room.title}' 교실에 ${request.name} 님을 배정할까요?`,
                      `Place ${request.name} in the classroom '${room.title}'?`,
                    ))) return;
                    decideMatch(request.id, "accepted", room.id);
                  }}
                >
                  {l("수락", "Accept")}
                </button>
                <button type="button" className={styles.ghost} disabled={busy} onClick={() => decideMatch(request.id, "declined")}>
                  {l("거절", "Decline")}
                </button>
              </div>
            </article>
          ))}
          {classrooms.length === 0 && (
            <p className={styles.matchNote}>
              {l("수락하려면 교실을 먼저 만들어 주세요.", "Create a classroom before accepting.")}
            </p>
          )}
        </section>
      )}

      {classrooms.length === 0 ? (
        <div className={styles.empty}>
          {role === "tutor"
            ? l("아직 교실이 없습니다. 아래에서 교실을 만들어 주세요.", "No classrooms yet. Create one below.")
            : l("아직 참여 중인 교실이 없습니다.", "You have not joined a classroom yet.")}
        </div>
      ) : (
        <nav className={styles.roomList} aria-label={l("내 교실 목록", "My classrooms")}>
          {classrooms.map((room) => (
            <Link
              className={styles.roomCard}
              href={`/portal/classroom/${room.id}`}
              // Rendering the room marks it as seen, so only a real visit may.
              prefetch={false}
              key={room.id}
              onClick={() => { if (room.updatedAt) openedUpdates.set(room.id, room.updatedAt); }}
            >
              <div>
                <h2>
                  {room.title}
                  {room.updatedAt && openedUpdates.get(room.id) !== room.updatedAt && (
                    <i className={styles.updateDot} role="img" aria-label={l("새 소식 있음", "New updates")} />
                  )}
                </h2>
                <p>{room.subject || l("과목 미정", "Subject not set")}</p>
              </div>
              <span className={styles.roomArrow} aria-hidden="true">→</span>
            </Link>
          ))}
        </nav>
      )}

      {role === "tutor" && (
        <section className={styles.requests}>
          <h2>{l("교실 만들기", "Create a classroom")}</h2>
          <p className={styles.matchNote}>
            {l(
              `교실 ${classrooms.length}/${classroomLimit}개 · 학생이 배정되지 않아도 미리 만들 수 있습니다.`,
              `${classrooms.length} of ${classroomLimit} classrooms · a room can exist before anyone is matched into it.`,
            )}
          </p>
          {atLimit ? (
            slotRequestPending ? (
              <p className={styles.matchNote}>
                {l("관리자가 추가 교실 요청을 검토하고 있습니다.", "The admin is reviewing your request for more rooms.")}
              </p>
            ) : (
              <form className={styles.joinForm} onSubmit={requestSlot}>
                <label className={styles.wideField}>
                  <span>{l("추가 교실이 필요한 이유", "Why you need another room")}</span>
                  <input name="reason" required maxLength={200} />
                </label>
                <button type="submit" disabled={busy}>{l("관리자에게 요청", "Ask the admin")}</button>
              </form>
            )
          ) : (
            <form className={styles.joinForm} onSubmit={createRoom}>
              <label className={styles.wideField}>
                <span>{l("교실 이름", "Classroom name")}</span>
                <input name="title" required maxLength={80} placeholder={l("예: IB 수학 HL", "e.g. IB Math HL")} />
              </label>
              <button type="submit" disabled={busy}>{l("교실 만들기", "Create")}</button>
            </form>
          )}
        </section>
      )}

      {role === "parent" && (
        <form className={styles.joinCompact} onSubmit={join}>
          <h2>{l("교실 참여하기", "Join a classroom")}</h2>
          <input name="code" required maxLength={24} placeholder={l("교실 ID", "Classroom ID")} aria-label={l("교실 ID", "Classroom ID")} />
          <input name="password" required maxLength={32} placeholder={l("비밀번호", "Password")} aria-label={l("비밀번호", "Password")} />
          <button type="submit" disabled={busy}>{busy ? <Spinner label={l("보내는 중", "Sending")} /> : l("참여 요청", "Request access")}</button>
          {message && <p role="status">{message}</p>}
        </form>
      )}
    </section>
  );
}
