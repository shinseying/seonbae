import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { TUTOR_CONTRACT_VERSION } from "../../../../utils/contracts/tutor-contract";
import { registryRowFromApplication } from "../../../../utils/tutors/from-application";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: jsonError("로그인이 필요합니다.", 401) };
  const { data: reviewer } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (reviewer?.role !== "admin") return { error: jsonError("관리자 권한이 필요합니다.", 403) };
  try {
    return { user, admin: createAdminClient() };
  } catch {
    return { error: jsonError("관리자 데이터 연결이 설정되지 않았습니다.", 503) };
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("심사 요청 형식을 확인해 주세요.", 400);
  }
  const id = Number(body.id);
  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (!Number.isInteger(id) || !decision) return jsonError("심사 번호와 결과를 확인해 주세요.", 400);

  const { data: application } = await admin
    .from("account_creation_requests")
    .select("id,user_id,email,full_name,requested_role,status,university,subjects,curriculum,official_score,introduction,subject_scores,languages,lesson_format")
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

// Removing a request drops the row and the private documents it uploaded. The
// Supabase Auth user is deliberately left alone: deleting an account is a
// separate, heavier action than clearing a duplicate or spam application.
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("삭제 요청 형식을 확인해 주세요.", 400);
  }
  const id = Number(body.id);
  if (!Number.isInteger(id)) return jsonError("삭제할 신청 번호를 확인해 주세요.", 400);

  const { data: application } = await admin
    .from("account_creation_requests")
    .select("id,acceptance_letter_path,credential_path")
    .eq("id", id)
    .single();
  if (!application) return jsonError("이미 삭제됐거나 없는 신청입니다.", 404);

  // tutor_contract_signatures references this row with `on delete restrict`, so
  // a signed contract blocks the delete at the database. Say so plainly instead
  // of surfacing a raw constraint error.
  const { count: signatureCount } = await admin
    .from("tutor_contract_signatures")
    .select("id", { count: "exact", head: true })
    .eq("application_request_id", id);
  if (signatureCount) {
    return jsonError("튜터 계약 서명이 연결된 신청은 삭제할 수 없습니다. 보완 요청으로 반려해 주세요.", 409);
  }

  const { error } = await admin.from("account_creation_requests").delete().eq("id", id);
  if (error) return jsonError("신청을 삭제하지 못했습니다.", 500);

  const paths = [application.acceptance_letter_path, application.credential_path].filter(Boolean) as string[];
  if (paths.length) await admin.storage.from("account-documents").remove(paths);

  return NextResponse.json({ id, deleted: true });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
