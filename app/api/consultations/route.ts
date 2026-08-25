import { NextRequest, NextResponse } from "next/server";
import { sendConsultationRequestEmail } from "../../../utils/email/consultations";
import {
  authRateLimitResponse,
  consumeAuthRateLimit,
} from "../../../utils/auth/rate-limit";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

type ConsultationBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  curriculum?: unknown;
  preferredTutor?: unknown;
  preferredTimes?: unknown;
  subject?: unknown;
  goals?: unknown;
  language?: unknown;
  source?: unknown;
  website?: unknown;
};

export async function POST(request: NextRequest) {
  const rateLimit = await consumeAuthRateLimit(request, "consultation");
  if (!rateLimit.allowed) return authRateLimitResponse(rateLimit.retryAfterSeconds);

  let body: ConsultationBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "상담 신청 내용을 다시 확인해 주세요." }, { status: 400 });
  }

  if (cleanSingleLine(body.website, 120)) {
    return NextResponse.json({ received: true });
  }

  const name = cleanSingleLine(body.name, 80);
  const email = cleanSingleLine(body.email, 254).toLowerCase();
  const phone = cleanSingleLine(body.phone, 32) || null;
  const curriculum = cleanSingleLine(body.curriculum, 80);
  const preferredTutor = cleanSingleLine(body.preferredTutor, 80);
  const preferredTimes = cleanSingleLine(body.preferredTimes, 200);
  const subject = cleanSingleLine(body.subject, 120);
  const goals = cleanText(body.goals, 3000);
  const language = body.language === "en" ? "en" : "ko";
  const source = body.source === "footer" ? "footer" : "website";

  if (
    name.length < 2
    || !isEmail(email)
    || !curriculum
    || !subject
    || goals.length < 2
    || (phone && phone.length < 5)
  ) {
    return NextResponse.json({ error: "필수 상담 정보를 모두 입력해 주세요." }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "상담 접수 시스템이 아직 설정되지 않았습니다." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: consultation, error: insertError } = await admin
    .from("consultation_requests")
    .insert({
      user_id: user?.id || null,
      name,
      email,
      phone,
      curriculum,
      preferred_tutor: preferredTutor || null,
      preferred_times: preferredTimes || null,
      subject,
      goals,
      language,
      source,
    })
    .select("id")
    .single();

  if (insertError || !consultation) {
    console.error("Consultation request insert failed", {
      code: insertError?.code,
      message: insertError?.message,
    });
    return NextResponse.json({ error: "상담 신청을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }

  let notificationError: string | null = null;
  try {
    await sendConsultationRequestEmail({
      requestId: consultation.id,
      name,
      email,
      phone,
      curriculum,
      preferredTutor: preferredTutor || null,
      subject,
      goals,
      language,
    });
  } catch (error) {
    notificationError = error instanceof Error ? error.message.slice(0, 500) : "Email failed";
  }

  await admin
    .from("consultation_requests")
    .update(
      notificationError
        ? { notification_error: notificationError, updated_at: new Date().toISOString() }
        : { notification_sent_at: new Date().toISOString(), notification_error: null, updated_at: new Date().toISOString() },
    )
    .eq("id", consultation.id);

  return NextResponse.json({
    received: true,
    requestId: consultation.id,
    emailDelivered: !notificationError,
  }, { status: 201 });
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanSingleLine(value: unknown, maxLength: number) {
  return cleanText(value, maxLength).replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ");
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
