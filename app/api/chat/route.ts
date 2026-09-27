import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Student-tutor chat is switched off by operator decision (2026-09-28): tutors
// and students do not message each other through the portal. Threads and
// messages stay in the database; migration 20260927165424 also removed
// signed-in users' direct access to chat_messages. The previous handlers are
// in git history (before this commit) if chat returns.
function chatDisabled() {
  return NextResponse.json(
    { error: "포털 채팅은 현재 제공되지 않습니다." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  return chatDisabled();
}

export async function POST() {
  return chatDisabled();
}
