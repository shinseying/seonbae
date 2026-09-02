import "server-only";
import { actionButton, detailTable, emailShell } from "./layout";

type AccountReviewEmail = {
  requestId: number;
  fullName: string;
  email: string;
  phone: string;
  role: "student" | "parent" | "tutor";
  letterName?: string;
  letterUrl?: string;
};

const roleLabels = {
  student: "학생",
  parent: "보호자",
  tutor: "튜터",
};

export async function sendAdmissionsAccountReviewEmail(input: AccountReviewEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Admissions email delivery is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-account-${input.requestId}`,
    },
    body: JSON.stringify({
      from,
      to: ["admissions@seonbaetutor.com"],
      reply_to: input.email,
      subject: `[선배 가입 심사] ${input.fullName} · ${roleLabels[input.role]}`,
      html: accountReviewHtml(input),
      text: accountReviewText(input),
      tags: [
        { name: "workflow", value: "account_review" },
        { name: "role", value: input.role },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Admissions email failed (${response.status}): ${detail}`);
  }
}

function accountReviewHtml(input: AccountReviewEmail) {
  const documentAction = input.letterUrl && input.letterName
    ? actionButton(input.letterUrl, `${input.letterName} 확인`)
    : "";

  return emailShell({
    eyebrow: "Seonbae admissions",
    heading: "새 계정 심사가 도착했습니다.",
    body: detailTable([
      ["요청 번호", String(input.requestId)],
      ["이름", input.fullName],
      ["유형", roleLabels[input.role]],
      ["이메일", input.email],
      ["전화", input.phone],
    ]) + documentAction,
    footnote: "관리자 포털의 가입 심사 화면에서 승인 또는 반려해 주세요.",
  });
}

function accountReviewText(input: AccountReviewEmail) {
  return [
    "새 계정 심사가 도착했습니다.",
    `요청 번호: ${input.requestId}`,
    `이름: ${input.fullName}`,
    `유형: ${roleLabels[input.role]}`,
    `이메일: ${input.email}`,
    `전화: ${input.phone}`,
    input.letterUrl ? `제출 서류: ${input.letterUrl}` : "추가 제출 서류: 없음",
    "관리자 포털에서 승인 또는 반려해 주세요.",
  ].join("\n");
}
