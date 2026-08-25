import "server-only";
import { actionButton, detailTable, emailShell, noteBlock } from "./layout";

type ConsultationScheduledEmail = {
  consultationId: number;
  name: string;
  email: string;
  title: string;
  topic: string;
  sessionDate: string;
  startsAt: string;
  durationMinutes: number;
  joinUrl: string | null;
  hasAccount: boolean;
  portalUrl: string;
  signupUrl: string;
};

// Sent when an admin confirms a parent consultation. A consultation can be
// booked for someone with no account, so this mail carries the Zoom link on its
// own and explains that signing up with the same address surfaces it in the
// portal.
export async function sendConsultationScheduledEmail(input: ConsultationScheduledEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Consultation email delivery is not configured.");

  const when = formatWhen(input.sessionDate, input.startsAt);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-consultation-scheduled-${input.consultationId}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `[선배] 보호자 상담이 확정되었습니다 · ${when}`,
      html: html(input, when),
      text: plain(input, when),
      tags: [{ name: "workflow", value: "consultation_scheduled" }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Consultation scheduled email failed (${response.status}): ${detail}`);
  }
}

function html(input: ConsultationScheduledEmail, when: string) {
  const accountNote = input.hasAccount
    ? "포털에 로그인하시면 상담 일정과 입장 링크를 언제든 확인하실 수 있습니다."
    : "아직 계정이 없으셔도 위 링크로 참여하실 수 있습니다. 같은 이메일 주소로 가입하시면 이 상담이 포털에 자동으로 표시됩니다.";

  return emailShell({
    eyebrow: "Seonbae consultation",
    heading: `${input.name} 님, 보호자 상담이 확정되었습니다.`,
    body:
      detailTable([
        ["일시", when],
        ["상담 시간", `${input.durationMinutes}분`],
        ["상담 주제", input.topic],
        ["상담 제목", input.title],
      ])
      + noteBlock("안내", accountNote)
      + (input.joinUrl ? actionButton(input.joinUrl, "Zoom 상담 입장") : "")
      + actionButton(input.hasAccount ? input.portalUrl : input.signupUrl, input.hasAccount ? "포털에서 보기" : "계정 만들기"),
    footnote: "일정 변경이 필요하시면 이 메일에 답장해 주세요.",
  });
}

function plain(input: ConsultationScheduledEmail, when: string) {
  return [
    `${input.name} 님, 보호자 상담이 확정되었습니다.`,
    `일시: ${when}`,
    `상담 시간: ${input.durationMinutes}분`,
    `상담 주제: ${input.topic}`,
    input.joinUrl ? `Zoom 입장: ${input.joinUrl}` : "",
    input.hasAccount
      ? `포털: ${input.portalUrl}`
      : `같은 이메일로 가입하시면 포털에서도 확인하실 수 있습니다: ${input.signupUrl}`,
  ].filter(Boolean).join("\n");
}

function formatWhen(sessionDate: string, startsAt: string) {
  const date = new Date(`${sessionDate}T${startsAt}:00+09:00`);
  if (Number.isNaN(date.getTime())) return `${sessionDate} ${startsAt}`;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}
