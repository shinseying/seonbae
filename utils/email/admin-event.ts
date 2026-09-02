import "server-only";

import { actionButton, detailTable, emailShell, noteBlock } from "./layout";

export const ADMIN_EVENT_INBOX = "admissions@seonbaetutor.com";

type AdminEventEmail = {
  eventKey: string;
  eyebrow: string;
  heading: string;
  subject: string;
  rows: Array<[string, string]>;
  note?: { title: string; body: string };
  portalPath: string;
  origin: string;
  replyTo?: string;
};

export async function sendAdminEventEmail(input: AdminEventEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Admin event email delivery is not configured.");

  const body = detailTable(input.rows)
    + (input.note ? noteBlock(input.note.title, input.note.body) : "")
    + actionButton(new URL(input.portalPath, input.origin).toString(), "관리자 포털에서 확인");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-admin-event-${input.eventKey}`.slice(0, 255),
    },
    body: JSON.stringify({
      from,
      to: [ADMIN_EVENT_INBOX],
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      subject: input.subject,
      html: emailShell({
        eyebrow: input.eyebrow,
        heading: input.heading,
        body,
        footnote: "이 알림은 관리자 포털에 새로 접수된 항목과 연결되어 있습니다.",
      }),
      text: [
        input.heading,
        ...input.rows.map(([label, value]) => `${label}: ${value}`),
        input.note ? `${input.note.title}: ${input.note.body}` : "",
        `관리자 포털: ${new URL(input.portalPath, input.origin).toString()}`,
      ].filter(Boolean).join("\n"),
      tags: [{ name: "workflow", value: "admin_event" }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Admin event email failed (${response.status}): ${detail}`);
  }
}
