import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireChatUser();
  if ("error" in auth) return auth.error;

  const threadId = Number(request.nextUrl.searchParams.get("threadId"));
  if (!Number.isSafeInteger(threadId) || threadId < 1) {
    return NextResponse.json({ error: "대화방 번호가 올바르지 않습니다." }, { status: 400 });
  }

  const thread = await getAccessibleThread(auth.supabase, auth.profile, auth.user.id, threadId);
  if (!thread) {
    return NextResponse.json({ error: "이 대화방에 접근할 수 없습니다." }, { status: 403 });
  }

  const { data: messages, error } = await auth.supabase
    .from("chat_messages")
    .select("id,thread_id,sender_id,body,created_at,read_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json({ error: "메시지를 불러오지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json(
    { messages: [...(messages ?? [])].reverse() },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireChatUser();
  if ("error" in auth) return auth.error;

  let body: { threadId?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const threadId = Number(body.threadId);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (
    !Number.isSafeInteger(threadId)
    || threadId < 1
    || message.length < 1
    || message.length > 2000
  ) {
    return NextResponse.json(
      { error: "메시지는 1자 이상 2,000자 이하로 입력해 주세요." },
      { status: 400 },
    );
  }

  const thread = await getAccessibleThread(auth.supabase, auth.profile, auth.user.id, threadId);
  if (!thread) {
    return NextResponse.json({ error: "이 대화방에 접근할 수 없습니다." }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      sender_id: auth.user.id,
      body: message,
    })
    .select("id,thread_id,sender_id,body,created_at,read_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "메시지를 보내지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json(data, {
    status: 201,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

async function requireChatUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,tutor_registry_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["student", "tutor", "admin"].includes(profile.role)) {
    return {
      error: NextResponse.json(
        { error: "학생과 튜터 계정에서만 채팅을 이용할 수 있습니다." },
        { status: 403 },
      ),
    };
  }

  return { supabase, user, profile };
}

async function getAccessibleThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: { role: string; tutor_registry_id: string | null },
  userId: string,
  threadId: number,
) {
  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id,student_id,tutor_registry_id")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return null;
  if (profile.role === "admin") return thread;
  if (profile.role === "student" && thread.student_id === userId) return thread;
  if (
    profile.role === "tutor"
    && profile.tutor_registry_id
    && profile.tutor_registry_id === thread.tutor_registry_id
  ) {
    return thread;
  }
  return null;
}
