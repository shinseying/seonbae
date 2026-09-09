"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSeonbaeLocale } from "../../utils/i18n/client";
import styles from "./portal.module.css";

export type PortalChatThread = {
  id: number;
  counterpartName: string;
  counterpartMeta: string;
};

type PortalChatMessage = {
  id: number;
  thread_id: number;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export default function ChatPanel({
  currentUserId,
  threads,
  heading,
}: {
  currentUserId: string;
  threads: PortalChatThread[];
  heading?: string;
}) {
  const [activeThreadId, setActiveThreadId] = useState(
    threads[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<PortalChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const loadInFlight = useRef(false);
  const locale = useSeonbaeLocale();
  const l = (ko: string, en: string) => locale === "ko" ? ko : en;
  const visibleHeading = heading || l("튜터 채팅", "Tutor chat");

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );

  const loadMessages = useCallback(
    async (quiet = false) => {
      if (!activeThreadId) return;
      if (loadInFlight.current) return;
      loadInFlight.current = true;
      try {
        const response = await fetch(`/api/chat?threadId=${activeThreadId}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) {
          if (!quiet) {
            setStatus(locale === "ko" && result.error ? result.error : l("메시지를 불러오지 못했습니다.", "Messages could not be loaded."));
          }
          return;
        }
        setMessages(result.messages ?? []);
        if (!quiet) setStatus("");
      } catch {
        if (!quiet) setStatus(l("메시지 연결을 확인해 주세요.", "Check your connection and try again."));
      } finally {
        loadInFlight.current = false;
      }
    },
    [activeThreadId, locale],
  );

  useEffect(() => {
    setMessages([]);
    void loadMessages();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadMessages(true);
    };
    const interval = window.setInterval(refreshWhenVisible, 5000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [loadMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!activeThreadId || !message || sending) return;
    setSending(true);
    setStatus("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, message }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatus(locale === "ko" && result.error ? result.error : l("메시지를 보내지 못했습니다.", "The message could not be sent."));
        return;
      }
      setMessages((current) => [...current, result as PortalChatMessage]);
      setDraft("");
    } catch {
      setStatus(l("메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.", "The message could not be sent. Please try again shortly."));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={`${styles.panel} ${styles.chatPanel}`}>
      <div className={styles.panelHeading}>
        <div>
          <p>DIRECT MESSAGE</p>
          <h2>{visibleHeading}</h2>
        </div>
        <span className={styles.chatLive}>
          <i /> {l("화면을 보는 동안 자동 동기화", "Syncs while this tab is active")}
        </span>
      </div>

      {!threads.length ? (
        <div className={styles.chatEmpty}>
          {l("배정된 수업이 생기면 학생과 튜터 사이의 대화방이 자동으로 열립니다.", "A conversation opens automatically when a lesson is assigned.")}
        </div>
      ) : (
        <div className={styles.chatLayout}>
          <nav className={styles.chatThreads} aria-label={l("대화 상대", "Conversations")}>
            {threads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                data-active={thread.id === activeThreadId}
                onClick={() => setActiveThreadId(thread.id)}
              >
                <b>{thread.counterpartName}</b>
                <span>{thread.counterpartMeta}</span>
              </button>
            ))}
          </nav>

          <div className={styles.chatConversation}>
            <header>
              <b>{activeThread?.counterpartName}</b>
              <span>{activeThread?.counterpartMeta}</span>
            </header>
            <div className={styles.chatMessages} aria-live="polite">
              {messages.length ? (
                messages.map((message) => {
                  const mine = message.sender_id === currentUserId;
                  return (
                    <article key={message.id} data-mine={mine}>
                      <p>{message.body}</p>
                      <time>
                        {new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(message.created_at))}
                      </time>
                    </article>
                  );
                })
              ) : (
                <div className={styles.noMessages}>
                  {l("첫 메시지를 보내 보세요.", "Send the first message.")}
                </div>
              )}
            </div>
            <form onSubmit={sendMessage}>
              <textarea
                value={draft}
                onChange={(event) =>
                  setDraft(event.target.value.slice(0, 2000))
                }
                placeholder={locale === "ko"
                  ? `${activeThread?.counterpartName ?? "상대방"}에게 메시지 보내기`
                  : `Message ${activeThread?.counterpartName ?? "this person"}`}
                rows={2}
                maxLength={2000}
              />
              <button type="submit" disabled={sending || !draft.trim()}>
                {sending ? l("전송 중", "Sending") : l("보내기", "Send")} <span>→</span>
              </button>
            </form>
            {status && <p className={styles.chatStatus}>{status}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
