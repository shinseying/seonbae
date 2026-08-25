import "server-only";
import { actionButton, detailTable, emailShell, noteBlock } from "./layout";

type BookingEmail = {
  bookingId: number;
  tutorName: string;
  tutorEmail: string;
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  preferredDay?: string | null;
  preferredTime?: string | null;
  note?: string | null;
  portalUrl: string;
  // The same booking is mailed twice: once to the admin when it arrives, once
  // to the tutor when the admin forwards it. Resend rejects a reused
  // idempotency key whose payload changed, so the purpose is part of the key.
  purpose: "admin" | "tutor";
};

const DAY_LABELS: Record<string, string> = {
  mon: "월요일", tue: "화요일", wed: "수요일", thu: "목요일",
  fri: "금요일", sat: "토요일", sun: "일요일",
};

// Sent to the tutor when someone books an intro call. The admin sees the same
// booking in their portal, so this is the tutor's copy only.
export async function sendBookingEmail(input: BookingEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Booking email delivery is not configured.");

  const slot = input.preferredDay
    ? `${DAY_LABELS[input.preferredDay] || input.preferredDay} ${input.preferredTime || ""}`.trim()
    : "지정 없음";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-booking-${input.purpose}-${input.bookingId}`,
    },
    body: JSON.stringify({
      from,
      to: [input.tutorEmail],
      reply_to: input.email,
      subject: `[선배] 새 매칭 요청 · ${input.name}`,
      html: html(input, slot),
      text: plain(input, slot),
      tags: [{ name: "workflow", value: "lesson_booking" }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Booking email failed (${response.status}): ${detail}`);
  }
}

function html(input: BookingEmail, slot: string) {
  const rows: Array<[string, string]> = [
    ["이름", input.name],
    ["이메일", input.email],
  ];
  if (input.phone) rows.push(["연락처", input.phone]);
  if (input.subject) rows.push(["과목", input.subject]);
  rows.push(["희망 시간", slot]);

  return emailShell({
    eyebrow: "Seonbae match request",
    heading: `${input.tutorName} 선배님, 매칭 요청이 도착했습니다.`,
    body: detailTable(rows)
      + (input.note ? noteBlock("전하고 싶은 내용", input.note) : "")
      + actionButton(input.portalUrl, "튜터 포털에서 보기"),
  });
}

function plain(input: BookingEmail, slot: string) {
  return [
    `${input.tutorName} 선배님, 새 매칭 요청이 도착했습니다.`,
    `이름: ${input.name}`,
    `이메일: ${input.email}`,
    input.phone ? `연락처: ${input.phone}` : "",
    input.subject ? `과목: ${input.subject}` : "",
    `희망 시간: ${slot}`,
    input.note ? `메모: ${input.note}` : "",
    `튜터 포털: ${input.portalUrl}`,
  ].filter(Boolean).join("\n");
}
