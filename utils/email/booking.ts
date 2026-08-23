import "server-only";

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
      "Idempotency-Key": `seonbae-booking-${input.bookingId}`,
    },
    body: JSON.stringify({
      from,
      to: [input.tutorEmail],
      reply_to: input.email,
      subject: `[선배] 새 수업 예약 · ${input.name}`,
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
  const row = (label: string, value: string) =>
    `<tr><td style="padding:10px 14px;color:#53636c">${escapeHtml(label)}</td><td style="padding:10px 14px;font-weight:700">${escapeHtml(value)}</td></tr>`;

  return `
    <div style="font-family:Arial,sans-serif;color:#201e19;line-height:1.6;max-width:620px;background:#fbf7ef;padding:28px">
      <p style="font-size:12px;letter-spacing:.12em;color:#c1663a;font-weight:700">SEONBAE BOOKING</p>
      <h1 style="font-size:23px;color:#163a51">${escapeHtml(input.tutorName)} 선배님, 수업 예약이 도착했습니다.</h1>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:9px;margin:18px 0">
        ${row("이름", input.name)}
        ${row("이메일", input.email)}
        ${input.phone ? row("연락처", input.phone) : ""}
        ${input.subject ? row("과목", input.subject) : ""}
        ${row("희망 시간", slot)}
      </table>
      ${input.note ? `<p style="padding:14px 16px;background:#f4efe5;border-radius:8px;white-space:pre-wrap">${escapeHtml(input.note)}</p>` : ""}
      <p><a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;background:#163a51;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">튜터 포털에서 보기</a></p>
    </div>
  `;
}

function plain(input: BookingEmail, slot: string) {
  return [
    `${input.tutorName} 선배님, 새 수업 예약이 도착했습니다.`,
    `이름: ${input.name}`,
    `이메일: ${input.email}`,
    input.phone ? `연락처: ${input.phone}` : "",
    input.subject ? `과목: ${input.subject}` : "",
    `희망 시간: ${slot}`,
    input.note ? `메모: ${input.note}` : "",
    `튜터 포털: ${input.portalUrl}`,
  ].filter(Boolean).join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
