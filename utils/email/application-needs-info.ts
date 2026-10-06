import "server-only";
import { actionButton, emailShell, escapeHtml, noteBlock } from "./layout";

export type ApplicationNeedsInfoEmail = {
  requestId: number;
  reviewedAt: string;
  to: string;
  name: string;
  note: string;
  portalUrl: string;
};

// Tells the applicant what the admissions team asked for. Without it, they only
// learn about a 보완 요청 by logging in.
export async function sendApplicationNeedsInfoEmail(input: ApplicationNeedsInfoEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Application email delivery is not configured.");

  const heading = "가입 심사에 보완이 필요합니다.";
  const explanation = "아래 심사팀 메모를 확인하고, 로그인한 뒤 필요한 서류를 올려 다시 제출해 주세요. 제출하면 심사가 이어집니다.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-application-needs-info-${input.requestId}-${Date.parse(input.reviewedAt)}`.slice(0, 255),
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      reply_to: "admissions@seonbaetutor.com",
      subject: "[선배] 가입 심사 보완 요청",
      html: emailShell({
        eyebrow: "Seonbae admissions",
        heading,
        body: `<p style="margin:0">${escapeHtml(input.name)}님, ${escapeHtml(explanation)}</p>`
          + noteBlock("심사팀 메모", input.note)
          + actionButton(input.portalUrl, "로그인하고 서류 제출하기"),
        footnote: "문의는 admissions@seonbaetutor.com으로 보내 주세요.",
      }),
      text: [heading, `${input.name}님, ${explanation}`, `심사팀 메모:\n${input.note}`, input.portalUrl].join("\n\n"),
      tags: [{ name: "workflow", value: "application_needs_info" }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Application email failed (${response.status}): ${detail}`);
  }
}
