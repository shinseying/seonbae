import "server-only";
import { actionButton, detailTable, emailShell, escapeHtml } from "./layout";

export type MatchEndedEmail = {
  eventKey: string;
  to: string;
  name: string;
  audience: "student" | "parent" | "tutor";
  classroomTitle: string;
  studentName: string;
  tutorName: string;
  endedAt: string;
  availableUntil: string;
  cancelledLessons: number;
  portalUrl: string;
};

// One mail per person, so no one sees another family's or the tutor's
// address. The end reason stays with the admin: it may be something one side
// wrote about the other.
export async function sendMatchEndedEmail(input: MatchEndedEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMISSIONS_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Match-ended email delivery is not configured.");

  const endedOn = koreanDate(input.endedAt);
  const keptUntil = koreanDate(input.availableUntil);
  const forFamily = input.audience !== "tutor";
  const heading = forFamily
    ? `${input.tutorName} 선배와의 매칭이 종료되었습니다.`
    : `${input.studentName} 학생과의 매칭이 종료되었습니다.`;
  const rows: Array<[string, string]> = [
    ["교실", input.classroomTitle],
    [forFamily ? "튜터" : "학생", forFamily ? input.tutorName : input.studentName],
    ["종료일", endedOn],
    ["취소된 예정 수업", `${input.cancelledLessons}건`],
  ];
  if (forFamily) rows.push(["기록 보관", `${keptUntil}까지`]);

  const explanation = forFamily
    ? `예정되어 있던 수업과 Zoom 회의는 취소되었습니다. 지난 수업, 숙제와 피드백은 ${keptUntil}까지 내 교실에서 볼 수 있고, ‘기록 전체 내려받기 (ZIP)’로 저장할 수 있습니다. 그 뒤에는 기록과 파일이 삭제됩니다.`
    : "예정되어 있던 수업과 Zoom 회의는 취소되었고, 이 교실은 내 교실 목록에서 빠졌습니다. 교실 자리는 새 매칭에 다시 쓸 수 있습니다.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `seonbae-match-ended-${input.eventKey}`.slice(0, 255),
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: `[선배] 매칭 종료 안내 · ${input.classroomTitle}`,
      html: emailShell({
        eyebrow: "Seonbae classroom",
        heading,
        body: `<p style="margin:0 0 16px">${escapeHtml(input.name)}님, ${escapeHtml(explanation)}</p>`
          + detailTable(rows)
          + actionButton(input.portalUrl, forFamily ? "내 교실에서 기록 보기" : "튜터 포털 열기"),
        footnote: "문의가 있으면 이 메일에 회신하지 말고 admissions@seonbaetutor.com으로 연락해 주세요.",
      }),
      text: [
        heading,
        `${input.name}님, ${explanation}`,
        ...rows.map(([label, value]) => `${label}: ${value}`),
        input.portalUrl,
      ].join("\n"),
      tags: [{ name: "workflow", value: "match_ended" }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Match-ended email failed (${response.status}): ${detail}`);
  }
}

function koreanDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(value));
}
