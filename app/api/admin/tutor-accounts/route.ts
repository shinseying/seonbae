import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { registryRowFromApplication } from "../../../../utils/tutors/from-application";
import { ensureTutorApplicationRecord } from "../../../../utils/tutors/application-link";
import { sendTutorAccountCreatedEmail } from "../../../../utils/email/tutor-account";
import { normalizePhone } from "../../../../utils/auth/phone";
import { isKoreanSchoolEmail } from "../../../../utils/auth/school-email";

export const dynamic = "force-dynamic";

// An admin provisions the account from a reviewed application. The tutor gets
// a one-time setup link and chooses their own password before first use.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  let body: { requestId?: unknown; fullName?: unknown; email?: unknown; phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const admin = createAdminClient();
  const hasRequest = body.requestId !== undefined && body.requestId !== null && body.requestId !== "";
  const requestId = hasRequest ? Number(body.requestId) : null;

  // Two entry points: provision from a reviewed application, or create an
  // account outright when the admin already holds the tutor's details.
  // The whole row travels onward: registryRowFromApplication reads the
  // curriculum, score, university, and subjects the applicant submitted.
  let application: {
    id: number | null;
    full_name: string;
    email: string;
    phone: string;
    university?: string | null;
    subjects?: string | null;
    curriculum?: string | null;
    official_score?: string | null;
    introduction?: string | null;
    languages?: string | null;
    lesson_format?: string | null;
    subject_scores?: unknown;
    status: string;
  };
  if (requestId !== null) {
    if (!Number.isInteger(requestId)) {
      return NextResponse.json({ error: "지원서를 찾지 못했습니다." }, { status: 400 });
    }
    const { data: row } = await admin
      .from("account_creation_requests")
      .select("id,user_id,email,full_name,requested_role,status,university,subjects,curriculum,official_score,introduction,subject_scores,languages,lesson_format,phone")
      .eq("id", requestId)
      .single();

    if (!row || row.requested_role !== "tutor") {
      return NextResponse.json({ error: "튜터 지원서를 찾지 못했습니다." }, { status: 404 });
    }
    if (row.user_id) {
      return NextResponse.json({ error: "이미 계정이 있는 지원서입니다." }, { status: 409 });
    }
    application = { ...row, id: row.id };
  } else {
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 80) : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 24) : "";
    if (fullName.length < 2 || !isKoreanSchoolEmail(email)) {
      return NextResponse.json({ error: "이름과 학교 이메일 주소(.ac.kr)를 확인해 주세요." }, { status: 400 });
    }
    // profiles.phone is constrained to E.164 or null. Catch a bad number here so
    // the admin gets told what is wrong, rather than hitting the check
    // constraint further down and seeing a generic save failure.
    if (!normalizePhone(phone)) {
      return NextResponse.json({ error: "전화번호 형식을 확인해 주세요. 예: 01012345678" }, { status: 400 });
    }
    application = { id: null, full_name: fullName, email, phone, status: "pending" };
  }

  const { data: invite, error: createError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: application.email,
    options: {
      data: { full_name: application.full_name, account_role: "tutor" },
      redirectTo: `${request.nextUrl.origin}/api/auth/callback?next=/reset-password`,
    },
  });

  if (createError || !invite.user || !invite.properties?.action_link) {
    const alreadyExists = createError?.message?.toLowerCase().includes("already");
    return NextResponse.json(
      { error: alreadyExists ? "이미 해당 이메일로 가입된 계정이 있습니다." : "계정을 만들지 못했습니다." },
      { status: alreadyExists ? 409 : 500 },
    );
  }

  const reviewedAt = new Date().toISOString();
  const normalizedPhone = normalizePhone(application.phone ?? "");
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: application.full_name,
      // Normalised on the way in: an empty field has to be null, and an
      // application row may still carry a legacy "" or a raw 010 number.
      phone: normalizedPhone,
      role: "tutor",
      account_status: "approved",
      account_reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .eq("id", invite.user.id);

  if (profileError) {
    await admin.auth.admin.deleteUser(invite.user.id);
    return NextResponse.json({ error: "계정 정보를 저장하지 못했습니다." }, { status: 500 });
  }

  // A tutor account is useless without a registry row: the directory reads
  // public.tutors, and the tutor portal gates on profiles.tutor_registry_id.
  // The row starts hidden so an empty card never appears on the live site.
  const registryId = `T-${invite.user.id.slice(0, 8).toUpperCase()}`;
  const { error: registryError } = await admin
    .from("tutors")
    .upsert(registryRowFromApplication(registryId, application), {
      onConflict: "registry_id",
    });

  if (registryError) {
    await admin.auth.admin.deleteUser(invite.user.id);
    return NextResponse.json({ error: "튜터 명부를 만들지 못했습니다." }, { status: 500 });
  }

  const { error: linkError } = await admin
    .from("profiles")
    .update({ tutor_registry_id: registryId, updated_at: new Date().toISOString() })
    .eq("id", invite.user.id);

  if (linkError) {
    await admin.from("tutors").delete().eq("registry_id", registryId);
    await admin.auth.admin.deleteUser(invite.user.id);
    return NextResponse.json({ error: "튜터 명부를 계정에 연결하지 못했습니다." }, { status: 500 });
  }

  if (application.id !== null) {
    const { error: applicationLinkError } = await admin
      .from("account_creation_requests")
      .update({
        user_id: invite.user.id,
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
      })
      .eq("id", application.id);
    if (applicationLinkError) {
      await admin.from("tutors").delete().eq("registry_id", registryId);
      await admin.auth.admin.deleteUser(invite.user.id);
      return NextResponse.json({ error: "지원서를 계정에 연결하지 못했습니다." }, { status: 500 });
    }
  } else {
    // Even a manually provisioned tutor needs an application-shaped audit row:
    // the electronic contract has a non-null foreign key to it. This also links
    // a single older, unprovisioned application with the same email.
    try {
      await ensureTutorApplicationRecord(admin, invite.user.id, {
        full_name: application.full_name,
        email: application.email,
        phone: normalizedPhone,
        role: "tutor",
        account_status: "approved",
        account_reviewed_at: reviewedAt,
      });
    } catch {
      await admin.from("tutors").delete().eq("registry_id", registryId);
      await admin.auth.admin.deleteUser(invite.user.id);
      return NextResponse.json({ error: "계약용 가입 기록을 준비하지 못했습니다." }, { status: 500 });
    }
  }

  try {
    await sendTutorAccountCreatedEmail({
      deliveryId: invite.user.id,
      fullName: application.full_name,
      email: application.email,
      setupUrl: invite.properties.action_link,
    });
  } catch (sendError) {
    // No usable account is left behind when the only delivery path fails.
    // Preserve an existing application by unlinking it before auth deletion;
    // otherwise its profile foreign key would cascade the application away.
    if (application.id !== null) {
      const { error: restoreError } = await admin
        .from("account_creation_requests")
        .update({
          user_id: null,
          status: application.status,
          reviewed_by: null,
          reviewed_at: null,
          notification_error: String(sendError).slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id);
      if (restoreError) {
        // Do not delete the auth user when the original application could not
        // first be detached: its foreign key uses ON DELETE CASCADE. The
        // account remains recoverable through the normal password-reset flow.
        return NextResponse.json(
          {
            ok: true,
            registryId,
            warning: "계정은 생성되었지만 안내 메일 전송에 실패했습니다. 비밀번호 재설정 메일을 보내 주세요.",
          },
          { status: 201 },
        );
      }
    }
    await admin.from("tutors").delete().eq("registry_id", registryId);
    await admin.auth.admin.deleteUser(invite.user.id);
    return NextResponse.json(
      { error: "안내 메일을 보내지 못해 계정 생성을 취소했습니다. 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, registryId });
}
