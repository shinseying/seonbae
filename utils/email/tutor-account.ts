import "server-only";
import { actionButton, detailTable, emailShell, noteBlock } from "./layout";

type TutorAccountEmail = {
  deliveryId: string;
  fullName: string;
  email: string;
  setupUrl: string;
};

// Sent once when an admin provisions a tutor account. The invite link lets the
// tutor choose a password, so no reusable credential travels by email.
export async function sendTutorAccountCreatedEmail(input: TutorAccountEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Tutor account email delivery is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-tutor-account-${input.deliveryId}`,
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
    body: `<p style="margin:0 0 16px">심사가 완료되어 선배 튜터 계정을 준비했습니다. 아래 링크에서 비밀번호를 설정해 주세요.</p>`
      + detailTable([["아이디", input.email]])
      + noteBlock(
          "보안 안내",
          "이 링크는 본인만 사용해 주세요. 만료되었으면 로그인 화면에서 비밀번호 재설정을 요청할 수 있습니다.",
        )
      + actionButton(input.setupUrl, "비밀번호 설정"),
    footnote: "이 메일을 요청하지 않으셨다면 admissions@seonbaetutor.com으로 알려주세요.",
  });
}

function plain(input: TutorAccountEmail) {
  return [
    `${input.fullName} 선배님, 선배 튜터 계정이 생성되었습니다.`,
    `아이디: ${input.email}`,
    "아래 보안 링크에서 비밀번호를 설정해 주세요.",
    input.setupUrl,
  ].join("\n");
}
