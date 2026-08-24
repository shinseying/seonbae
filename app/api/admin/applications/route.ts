import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { TUTOR_CONTRACT_VERSION } from "../../../../utils/contracts/tutor-contract";
import { registryRowFromApplication } from "../../../../utils/tutors/from-application";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const { data: reviewer } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (reviewer?.role !== "admin") return jsonError("관리자 권한이 필요합니다.", 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("심사 요청 형식을 확인해 주세요.", 400);
  }
  const kind = body.kind === "credential" ? "credential" : "account";
  const id = Number(body.id);
  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (!Number.isInteger(id) || !decision) return jsonError("심사 번호와 결과를 확인해 주세요.", 400);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("관리자 데이터 연결이 설정되지 않았습니다.", 503);
  }

  if (kind === "account") {
    const { data: application } = await admin
      .from("account_creation_requests")
      .select("id,user_id,email,full_name,requested_role,status,university,subjects,curriculum,official_score,introduction")
      .eq("id", id)
      .single();
    if (!application || application.status !== "pending") return jsonError("이미 처리됐거나 없는 신청입니다.", 404);

    let tutorRegistryId: string | null = null;
    if (decision === "approved" && application.requested_role === "tutor") {
      const { data: signature, error: signatureError } = await admin
        .from("tutor_contract_signatures")
        .select("id")
        .eq("tutor_id", application.user_id)
        .eq("contract_version", TUTOR_CONTRACT_VERSION)
        .maybeSingle();
      if (signatureError || !signature) {
        return jsonError("튜터 계약 서명이 완료되어야 계정을 승인할 수 있습니다.", 409);
      }
      const currentProfile = await admin
        .from("profiles")
        .select("tutor_registry_id")
        .eq("id", application.user_id)
        .single();
      tutorRegistryId = currentProfile.data?.tutor_registry_id || `T-${application.user_id.slice(0, 8).toUpperCase()}`;
      const { error: tutorError } = await admin
        .from("tutors")
        .upsert(registryRowFromApplication(tutorRegistryId, application), {
          onConflict: "registry_id",
        });
      if (tutorError) return jsonError("튜터 명부 초안을 만들지 못했습니다.", 500);
    }

    const reviewedAt = new Date().toISOString();
    const profileUpdate = await admin
      .from("profiles")
      .update({
        account_status: decision,
        account_reviewed_at: reviewedAt,
        role: application.requested_role,
        ...(tutorRegistryId ? { tutor_registry_id: tutorRegistryId } : {}),
        updated_at: reviewedAt,
      })
      .eq("id", application.user_id);
    if (profileUpdate.error) return jsonError("계정 승인 상태를 저장하지 못했습니다.", 500);

    const result = await admin
      .from("account_creation_requests")
      .update({ status: decision, reviewed_by: user.id, reviewed_at: reviewedAt, review_note: note || null, updated_at: reviewedAt })
      .eq("id", id)
      .select("id,status,reviewed_at")
      .single();
    if (result.error) return jsonError("심사 결과를 저장하지 못했습니다.", 500);
    return NextResponse.json(result.data);
  }

  const { data: credential } = await admin
    .from("tutor_credentials")
    .select("id,tutor_registry_id,credential_type,title,issuer,score,status")
    .eq("id", id)
    .single();
  if (!credential || credential.status !== "pending") return jsonError("이미 처리됐거나 없는 검증 자료입니다.", 404);
  const reviewedAt = new Date().toISOString();
  const result = await admin
    .from("tutor_credentials")
    .update({
      status: decision,
      display_on_profile: decision === "approved",
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
      review_note: note || null,
      updated_at: reviewedAt,
    })
    .eq("id", id)
    .select("id,status,display_on_profile,reviewed_at")
    .single();
  if (result.error) return jsonError("검증 결과를 저장하지 못했습니다.", 500);

  if (decision === "approved" && credential.tutor_registry_id) {
    const updates = credential.credential_type === "test_score"
      ? { exam: credential.title, score: credential.score || "검증 완료", active: true, updated_at: reviewedAt }
      : credential.credential_type === "enrollment" || credential.credential_type === "degree"
        ? { university: credential.issuer, active: true, updated_at: reviewedAt }
        : { active: true, updated_at: reviewedAt };
    await admin.from("tutors").update(updates).eq("registry_id", credential.tutor_registry_id);
  }
  return NextResponse.json(result.data);
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
