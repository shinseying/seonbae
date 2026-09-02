import "server-only";

import { codeBlock, emailShell } from "./layout";

type LoginVerificationEmail = {
  email: string;
  code: string;
  expiresAt: number;
  userId: string;
};

export async function sendLoginVerificationEmail(input: LoginVerificationEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Login verification email is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-login-${input.userId}-${input.expiresAt}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `[선배] 로그인 인증 코드 ${input.code}`,
      html: emailShell({
        eyebrow: "Seonbae secure login",
        heading: "로그인 인증 코드를 확인해 주세요.",
        body: codeBlock("인증 코드", input.code)
          + `<p style="margin:18px 0 0;font-size:14px;line-height:1.65">이 코드는 10분 동안 유효합니다. 본인이 요청하지 않았다면 비밀번호를 변경하고 admissions@seonbaetutor.com으로 알려 주세요.</p>`,
        footnote: "선배 포털 로그인 화면에 이 코드를 입력해 주세요.",
      }),
      text: [
        "선배 포털 로그인 인증 코드",
        input.code,
        "이 코드는 10분 동안 유효합니다.",
        "본인이 요청하지 않았다면 admissions@seonbaetutor.com으로 알려 주세요.",
      ].join("\n"),
      tags: [{ name: "workflow", value: "login_verification" }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Login verification email failed (${response.status}): ${detail}`);
  }
}
