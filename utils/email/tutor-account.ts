import "server-only";
import { actionButton, codeBlock, detailTable, emailShell, noteBlock } from "./layout";

type TutorAccountEmail = {
  requestId: number | string;
  fullName: string;
  email: string;
  temporaryPassword: string;
  changeByDays: number;
  loginUrl: string;
};

// Sent once, when an admin provisions a tutor account. The temporary password
// travels in this message and nowhere else, so it is never stored in plain text
// on our side.
export async function sendTutorAccountCreatedEmail(input: TutorAccountEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Tutor account email delivery is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-tutor-account-${input.requestId}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "[선배] 튜터 계정이 생성되었습니다",
      html: html(input),
      text: plain(input),
      tags: [{ name: "workflow", value: "tutor_account_created" }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Tutor account email failed (${response.status}): ${detail}`);
  }
}

function html(input: TutorAccountEmail) {
  return emailShell({
    eyebrow: "Seonbae tutor",
    heading: `${input.fullName} 선배님, 계정이 준비되었습니다.`,
    body: `<p style="margin:0 0 16px">심사가 완료되어 선배 튜터 계정을 만들었습니다. 아래 임시 비밀번호로 로그인해 주세요.</p>`
      + detailTable([["아이디", input.email]])
      + codeBlock("임시 비밀번호", input.temporaryPassword)
      + noteBlock(
          "비밀번호 변경 안내",
          `보안을 위해 ${input.changeByDays}일 이내에 비밀번호를 반드시 변경해 주세요. 포털 로그인 후 내 정보에서 바로 바꿀 수 있습니다.`,
        )
      + actionButton(input.loginUrl, "포털 로그인"),
    footnote: "이 메일을 요청하지 않으셨다면 admissions@seonbae.com으로 알려주세요.",
  });
}

function plain(input: TutorAccountEmail) {
  return [
    `${input.fullName} 선배님, 선배 튜터 계정이 생성되었습니다.`,
    `아이디: ${input.email}`,
    `임시 비밀번호: ${input.temporaryPassword}`,
    `보안을 위해 ${input.changeByDays}일 이내에 비밀번호를 변경해 주세요.`,
    `로그인: ${input.loginUrl}`,
  ].join("\n");
}
