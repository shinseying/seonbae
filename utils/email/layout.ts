import "server-only";

// One shell for every Seonbae email, built from the marketing design tokens in
// marketing/src/styles/global.css so a message looks like the site it came
// from. Mail clients strip <style> and custom fonts, so the tokens are inlined
// literals and the stack falls back to what the client already has.
const TOKEN = {
  canvas: "#fbf7ef", // warm cream ground
  card: "#fffdf7", // paper white
  ink: "#201e19", // warm near-black
  navy: "#163a51", // primary navy
  navyDeep: "#15303f", // deep navy
  gold: "#d6a02b", // honey accent
  honey: "#fbeed8", // honey-cream surface
  line: "#e5ddcd", // quiet warm border
  muted: "#565759", // body grey, no blue cast
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Malgun Gothic',Roboto,'Helvetica Neue',Arial,sans-serif";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

// The eyebrow is navy on a gold rule rather than a coloured label: the site
// reserves its warm accent for illustration, and orange is not used at all.
export function emailShell({
  eyebrow,
  heading,
  body,
  footnote,
}: {
  eyebrow: string;
  heading: string;
  body: string;
  footnote?: string;
}) {
  return `
  <div style="margin:0;padding:24px 12px;background:${TOKEN.canvas};font-family:${FONT}">
    <div style="max-width:600px;margin:0 auto">
      <div style="background:${TOKEN.card};border:1px solid ${TOKEN.line};border-radius:14px;padding:32px 28px">
        <div style="width:34px;height:3px;background:${TOKEN.gold};border-radius:2px"></div>
        <p style="margin:14px 0 0;font-size:11px;letter-spacing:.14em;color:${TOKEN.navy};font-weight:700;text-transform:uppercase">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:8px 0 0;font-size:23px;line-height:1.35;color:${TOKEN.ink};font-weight:800">${escapeHtml(heading)}</h1>
        <div style="margin-top:20px;font-size:15px;line-height:1.65;color:${TOKEN.ink}">${body}</div>
      </div>
      <p style="margin:16px 4px 0;font-size:12px;line-height:1.6;color:${TOKEN.muted}">
        ${footnote ? `${escapeHtml(footnote)}<br />` : ""}선배 Seonbae · <a href="https://seonbaetutor.com" style="color:${TOKEN.navy};text-decoration:none">seonbaetutor.com</a>
      </p>
    </div>
  </div>`;
}

// Label/value pairs. Kept as a table because that is the one layout every mail
// client still gets right.
export function detailTable(rows: Array<[string, string]>) {
  const cells = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:11px 14px;border-bottom:1px solid ${TOKEN.line};color:${TOKEN.muted};font-size:13px;white-space:nowrap">${escapeHtml(label)}</td>
        <td style="padding:11px 14px;border-bottom:1px solid ${TOKEN.line};color:${TOKEN.ink};font-size:14px;font-weight:600">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:4px 0 0;border:1px solid ${TOKEN.line};border-radius:10px;overflow:hidden">${cells}</table>`;
}

export function noteBlock(title: string, text: string) {
  return `
    <p style="margin:22px 0 8px;font-size:12px;letter-spacing:.08em;color:${TOKEN.muted};font-weight:700;text-transform:uppercase">${escapeHtml(title)}</p>
    <div style="white-space:pre-wrap;background:${TOKEN.honey};border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.6;color:${TOKEN.ink}">${escapeHtml(text)}</div>`;
}

export function actionButton(href: string, label: string) {
  return `
    <p style="margin:24px 0 0">
      <a href="${escapeHtml(href)}" style="display:inline-block;background:${TOKEN.navyDeep};color:${TOKEN.card};text-decoration:none;padding:13px 22px;border-radius:9px;font-weight:700;font-size:14px">${escapeHtml(label)}</a>
    </p>`;
}

// A credential the recipient has to read character by character.
export function codeBlock(label: string, value: string) {
  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:4px 0 0;border:1px solid ${TOKEN.line};border-radius:10px;overflow:hidden">
      <tr>
        <td style="padding:11px 14px;border-bottom:1px solid ${TOKEN.line};color:${TOKEN.muted};font-size:13px;white-space:nowrap">${escapeHtml(label)}</td>
        <td style="padding:11px 14px;border-bottom:1px solid ${TOKEN.line};background:${TOKEN.honey};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;font-size:15px;color:${TOKEN.ink}">${escapeHtml(value)}</td>
      </tr>
    </table>`;
}
