"use client";

import { FormEvent, useState } from "react";
import { usePortalText } from "./PortalLocale";
import styles from "./complaint.module.css";

export default function ComplaintForm() {
  const { text: l } = usePortalText();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || l("접수하지 못했습니다.", "Could not submit."));
      setTone("ok");
      setMessage(l("선배팀에 전달되었습니다.", "Sent to the Seonbae team."));
      setBody("");
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : l("네트워크를 확인해 주세요.", "Check your connection."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <header>
        <p>SUPPORT</p>
        <h2>{l("불편사항·문의", "Complaint or question")}</h2>
        <span>{l("남겨 주시면 선배팀(관리자)에게 바로 전달됩니다.", "Anything you leave here goes straight to the Seonbae admin team.")}</span>
      </header>
      <form onSubmit={submit}>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          maxLength={4000}
          required
          placeholder={l("어떤 점이 불편하셨나요?", "What can we help with?")}
        />
        {message && <p className={styles.message} data-tone={tone} role="status">{message}</p>}
        <button type="submit" disabled={busy || body.trim().length < 2}>
          {busy ? l("보내는 중...", "Sending...") : l("보내기", "Send")}
        </button>
      </form>
    </section>
  );
}
