import "server-only";
import { detailTable, emailShell, noteBlock } from "./layout";

type ConsultationEmail = {
  requestId: number;
  name: string;
  email: string;
  phone: string | null;
  curriculum: string;
  preferredTutor: string | null;
  subject: string;
  goals: string;
  language: "ko" | "en";
};

const CONSULTATION_INBOX = "admissions@seonbaetutor.com";

export async function sendConsultationRequestEmail(input: ConsultationEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Consultation email delivery is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-consultation-${input.requestId}`,
    },
    body: JSON.stringify({
      from,
      to: [CONSULTATION_INBOX],
      reply_to: input.email,
      subject: `[선배 상담 #${input.requestId}] ${input.name} · ${input.curriculum} · ${input.subject}`,
      html: consultationHtml(input),
      text: consultationText(input),
      tags: [
        { name: "workflow", value: "consultation" },
        { name: "language", value: input.language },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Consultation email failed (${response.status}): ${detail}`);
  }
}

function consultationHtml(input: ConsultationEmail) {
  return emailShell({
    eyebrow: "Seonbae consultation",
    heading: "새 상담 신청이 접수되었습니다.",
    body: detailTable([
      ["신청 번호", String(input.requestId)],
      ["성함", input.name],
      ["이메일", input.email],
      ["전화번호", input.phone || "미입력"],
      ["커리큐럼", input.curriculum],
      ["희망 튜터", input.preferredTutor || "팀 추천"],
      ["과목", input.subject],
    ]) + noteBlock("목표와 현재 상황", input.goals),
    footnote: "이 메일에 답장하면 신청자 이메일로 전송됩니다. 관리자 포털에서도 신청을 확인할 수 있습니다.",
  });
}

function consultationText(input: ConsultationEmail) {
  return [
    "새 상담 신청이 접수되었습니다.",
    `신청 번호: ${input.requestId}`,
    `성함: ${input.name}`,
    `이메일: ${input.email}`,
    `전화번호: ${input.phone || "미입력"}`,
    `커리큐럼: ${input.curriculum}`,
    `희망 튜터: ${input.preferredTutor || "팀 추천"}`,
    `과목: ${input.subject}`,
    "",
    "목표와 현재 상황",
    input.goals,
  ].join("\n");
}
