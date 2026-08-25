"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { usePortalText } from "../PortalLocale";
import styles from "./classroom.module.css";

export type Classroom = {
  id: number;
  title: string;
  studentName: string;
  tutorName: string;
  joinCode: string | null;
  joinPassword: string | null;
  lessons: Array<{
    id: number;
    date: string;
    startsAt: string;
    subject: string;
    title: string;
    notes: string | null;
    status: string;
    recordingUrl: string | null;
  }>;
  homework: Array<{
    id: number;
    title: string;
    dueDate: string | null;
    status: string;
    feedback: string | null;
  }>;
  members: Array<{ id: number; name: string; role: string }>;
};

export type JoinRequest = {
  id: number;
  classroomId: number;
  name: string;
  role: string;
  requestedAt: string;
};

export default function ClassroomView({
  role,
  classrooms,
  pendingRequests,
}: {
  role: "student" | "parent" | "tutor";
  classrooms: Classroom[];
  pendingRequests: JoinRequest[];
}) {
  const { text: l } = usePortalText();
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(classrooms[0]?.id ?? null);
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

  async function decide(id: number, decision: "approved" | "rejected") {
    setBusy(true);
    try {
      const response = await fetch("/api/classroom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setMessage(result?.error || l("처리하지 못했습니다.", "Could not process."));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const open = classrooms.find((room) => room.id === openId) ?? null;

  return (
    <section className={styles.shell}>
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

      {message && <p className={styles.message} role="status">{message}</p>}

      {role === "tutor" && pendingRequests.length > 0 && (
        <section className={styles.requests}>
          <h2>{l("참여 요청", "Join requests")}</h2>
          {pendingRequests.map((request) => (
            <article key={request.id}>
              <div>
                <b>{request.name}</b>
                <small>{request.role === "parent" ? l("보호자", "Parent") : l("학생", "Student")}</small>
              </div>
              <div className={styles.requestActions}>
                <button type="button" disabled={busy} onClick={() => decide(request.id, "approved")}>
                  {l("수락", "Accept")}
                </button>
                <button type="button" className={styles.ghost} disabled={busy} onClick={() => decide(request.id, "rejected")}>
                  {l("거절", "Decline")}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {role !== "tutor" && (
        <form className={styles.joinForm} onSubmit={join}>
          <div>
            <h2>{l("교실 참여하기", "Join a classroom")}</h2>
            <p>{l("튜터에게 받은 교실 ID와 비밀번호를 입력하면 참여 요청이 전송됩니다.", "Enter the classroom ID and password from the tutor to request access.")}</p>
          </div>
          <label><span>{l("교실 ID", "Classroom ID")}</span><input name="code" required maxLength={24} placeholder="C-ABC123" /></label>
          <label><span>{l("비밀번호", "Password")}</span><input name="password" required maxLength={32} /></label>
          <button type="submit" disabled={busy}>{busy ? l("보내는 중…", "Sending…") : l("참여 요청", "Request access")}</button>
        </form>
      )}

      {classrooms.length === 0 ? (
        <div className={styles.empty}>
          {role === "tutor"
            ? l("아직 담당 교실이 없습니다. 수업이 배정되면 교실이 만들어집니다.", "No classrooms yet. One is created when a lesson is scheduled.")
            : l("아직 참여 중인 교실이 없습니다.", "You have not joined a classroom yet.")}
        </div>
      ) : (
        <div className={styles.layout}>
          <aside className={styles.roomList}>
            {classrooms.map((room) => (
              <button
                type="button"
                key={room.id}
                className={room.id === openId ? styles.activeRoom : undefined}
                onClick={() => setOpenId(room.id)}
              >
                <b>{room.title}</b>
                <small>{l(`숙제 ${room.homework.length} · 수업 ${room.lessons.length}`, `${room.homework.length} homework · ${room.lessons.length} lessons`)}</small>
              </button>
            ))}
          </aside>

          {open && (
            <div className={styles.room}>
              <header>
                <h2>{open.title}</h2>
                <p>{l("학생", "Student")} {open.studentName} · {l("튜터", "Tutor")} {open.tutorName}</p>
              </header>

              {open.joinCode && (
                <div className={styles.codeBox}>
                  <div>
                    <small>{l("교실 ID", "Classroom ID")}</small>
                    <b>{open.joinCode}</b>
                  </div>
                  <div>
                    <small>{l("비밀번호", "Password")}</small>
                    <b>{open.joinPassword}</b>
                  </div>
                  <p>{l("보호자에게 전달하면 이 교실에 참여를 요청할 수 있습니다.", "Give these to a parent so they can request access.")}</p>
                </div>
              )}

              <section className={styles.block}>
                <h3>{l("숙제와 피드백", "Homework and feedback")}</h3>
                {open.homework.length ? open.homework.map((item) => (
                  <article key={item.id} className={styles.item}>
                    <div>
                      <b>{item.title}</b>
                      <small>{item.dueDate ? `${l("마감", "Due")} ${item.dueDate}` : l("마감 없음", "No due date")}</small>
                    </div>
                    <span data-status={item.status}>{homeworkLabel(item.status)}</span>
                    {item.feedback && <p className={styles.feedback}>{item.feedback}</p>}
                  </article>
                )) : <p className={styles.blockEmpty}>{l("등록된 숙제가 없습니다.", "No homework yet.")}</p>}
              </section>

              <section className={styles.block}>
                <h3>{l("수업과 녹화본", "Lessons and recordings")}</h3>
                {open.lessons.length ? open.lessons.map((lesson) => (
                  <article key={lesson.id} className={styles.item}>
                    <div>
                      <b>{lesson.title}</b>
                      <small>{lesson.date} {lesson.startsAt?.slice(0, 5)} · {lesson.subject}</small>
                    </div>
                    {lesson.recordingUrl
                      ? <a href={lesson.recordingUrl} target="_blank" rel="noreferrer">{l("녹화본 보기", "Watch recording")} ↗</a>
                      : <span data-status={lesson.status}>{lesson.status === "ended" ? l("녹화 준비 중", "Recording pending") : l("예정", "Upcoming")}</span>}
                    {lesson.notes && <p className={styles.feedback}>{lesson.notes}</p>}
                  </article>
                )) : <p className={styles.blockEmpty}>{l("수업 기록이 없습니다.", "No lessons yet.")}</p>}
              </section>

              {open.members.length > 0 && (
                <section className={styles.block}>
                  <h3>{l("참여 중인 보호자", "Parents in this classroom")}</h3>
                  <p className={styles.blockEmpty}>{open.members.map((member) => member.name).join(", ")}</p>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function homeworkLabel(status: string) {
  if (status === "submitted") return "제출 완료";
  if (status === "graded") return "피드백 완료";
  return "진행 중";
}
