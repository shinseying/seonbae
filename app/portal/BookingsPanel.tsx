"use client";

import { useEffect, useState } from "react";
import { usePortalText } from "./PortalLocale";
import styles from "./bookings.module.css";

export type PortalBooking = {
  id: number;
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
};

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
}: {
  bookings: PortalBooking[];
  showTutor?: boolean;
}) {
  const { locale, text: l } = usePortalText();
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
              {showTutor && (
                item.forwardedAt ? (
                  <span className={styles.forwarded}>{l("튜터에게 전달됨", "Forwarded to tutor")}</span>
                ) : (
                  <button
                    type="button"
                    className={styles.forwardButton}
                    onClick={() => forward(item.id)}
                    disabled={forwardingId === item.id}
                  >
                    {forwardingId === item.id ? l("전달 중…", "Forwarding…") : l("튜터에게 전달", "Forward to tutor")}
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
