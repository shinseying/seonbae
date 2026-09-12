import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { createClient } from "../../../../utils/supabase/server";
import { TUTOR_CONTRACT_VERSION } from "../../../../utils/contracts/tutor-contract";
import { isMissingDocumentsRelation } from "../../../../utils/tutors/admin-details";
import { collectApplicationDocumentPaths } from "../../../../utils/tutors/application-documents";
import { registryRowFromApplication } from "../../../../utils/tutors/from-application";
import { parseTutorCardChoice } from "../../../../utils/tutors/provisioning";
import { createTutorRegistryId } from "../../../../utils/tutors/registry-id";

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
    .select("id,user_id,email,full_name,requested_role,status,university,subjects,curriculum,official_score,introduction,subject_scores,languages")
    .eq("id", id)
    .single();
  if (!application || application.status !== "pending") return jsonError("이미 처리됐거나 없는 신청입니다.", 404);

  if (decision === "approved" && !application.user_id) {
    return jsonError("먼저 계정을 생성한 뒤 승인해 주세요.", 409);
  }

  const { data: originalProfile, error: profileLookupError } = application.user_id
    ? await admin
        .from("profiles")
        .select("role,account_status,account_reviewed_at,tutor_registry_id,updated_at")
        .eq("id", application.user_id)
        .single()
    : { data: null, error: null };
  if (application.user_id && (profileLookupError || !originalProfile)) {
    return jsonError("가입 신청에 연결된 계정을 찾지 못했습니다.", 404);
  }

  let tutorRegistryId: string | null = null;
  let createdRegistryId: string | null = null;
  let signature: { id: string; tutor_registry_id: string | null } | null = null;
  const cardChoice = parseTutorCardChoice(body.cardMode, body.existingRegistryId);

  if (decision === "approved" && application.requested_role === "tutor") {
    const signatureResult = await admin
      .from("tutor_contract_signatures")
      .select("id,tutor_registry_id")
      .eq("tutor_id", application.user_id)
      .eq("contract_version", TUTOR_CONTRACT_VERSION)
      .maybeSingle();
    signature = signatureResult.data;
    if (signatureResult.error || !signature) {
      return jsonError("튜터 계약 서명이 완료되어야 계정을 승인할 수 있습니다.", 409);
    }

    tutorRegistryId = originalProfile?.tutor_registry_id || null;
    if (!tutorRegistryId) {
      if (!cardChoice) {
        return jsonError("새 카드를 만들지, 기존 카드에 연결할지 먼저 선택해 주세요.", 400);
      }

      if (cardChoice.mode === "link") {
        const [{ data: existingCard, error: cardError }, { data: owner, error: ownerError }] = await Promise.all([
          admin
            .from("tutors")
            .select("registry_id")
            .eq("registry_id", cardChoice.registryId)
            .maybeSingle(),
          admin
            .from("profiles")
            .select("id")
            .eq("tutor_registry_id", cardChoice.registryId)
            .limit(1)
            .maybeSingle(),
        ]);
        if (cardError || ownerError) {
          return jsonError("튜터 카드의 연결 상태를 확인하지 못했습니다.", 503);
        }
        if (!existingCard) return jsonError("선택한 튜터 카드를 찾지 못했습니다.", 404);
        if (owner) {
          return jsonError("선택한 카드는 이미 다른 계정에 연결되어 있습니다. 목록을 새로고침해 주세요.", 409);
        }
        tutorRegistryId = cardChoice.registryId;
      } else {
        tutorRegistryId = createTutorRegistryId(application.user_id!);
        const { error: tutorError } = await admin
          .from("tutors")
          .insert(registryRowFromApplication(tutorRegistryId, application));
        if (tutorError) return jsonError("새 튜터 카드 초안을 만들지 못했습니다.", 500);
        createdRegistryId = tutorRegistryId;
      }
    }
  }

  const deleteCreatedCard = async () => {
    if (createdRegistryId) {
      await admin.from("tutors").delete().eq("registry_id", createdRegistryId);
    }
  };
  const restoreProfile = async () => {
    if (!application.user_id || !originalProfile) return;
    await admin
      .from("profiles")
      .update({
        role: originalProfile.role,
        account_status: originalProfile.account_status,
        account_reviewed_at: originalProfile.account_reviewed_at,
        tutor_registry_id: originalProfile.tutor_registry_id,
        updated_at: originalProfile.updated_at,
      })
      .eq("id", application.user_id);
  };

  const reviewedAt = new Date().toISOString();
  if (application.user_id) {
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
    if (profileUpdate.error) {
      await deleteCreatedCard();
      const claimed = profileUpdate.error.code === "23505";
      return jsonError(
        claimed
          ? "선택한 카드가 방금 다른 계정에 연결되었습니다. 목록을 새로고침해 주세요."
          : "계정 승인 상태를 저장하지 못했습니다.",
        claimed ? 409 : 500,
      );
    }
  }

  if (signature && tutorRegistryId && signature.tutor_registry_id !== tutorRegistryId) {
    const { error: signatureUpdateError } = await admin
      .from("tutor_contract_signatures")
      .update({ tutor_registry_id: tutorRegistryId })
      .eq("id", signature.id);
    if (signatureUpdateError) {
      await restoreProfile();
      await deleteCreatedCard();
      return jsonError("계약 기록에 튜터 카드를 연결하지 못했습니다.", 500);
    }
  }

  const result = await admin
    .from("account_creation_requests")
    .update({ status: decision, reviewed_by: user.id, reviewed_at: reviewedAt, review_note: note || null, updated_at: reviewedAt })
    .eq("id", id)
    .eq("status", "pending")
    .select("id,status,reviewed_at")
    .single();
  if (result.error) {
    if (signature && signature.tutor_registry_id !== tutorRegistryId) {
      await admin
        .from("tutor_contract_signatures")
        .update({ tutor_registry_id: signature.tutor_registry_id })
        .eq("id", signature.id);
    }
    await restoreProfile();
    await deleteCreatedCard();
    return jsonError("심사 결과를 저장하지 못했습니다.", 500);
  }
  return NextResponse.json({
    ...result.data,
    ...(tutorRegistryId ? { registryId: tutorRegistryId } : {}),
    ...(cardChoice ? { cardMode: cardChoice.mode } : {}),
  });
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

  const [{ data: application }, normalizedDocuments] = await Promise.all([
    admin
      .from("account_creation_requests")
      .select("id,acceptance_letter_path,credential_path")
      .eq("id", id)
      .single(),
    admin
      .from("account_request_documents")
      .select("storage_path")
      .eq("request_id", id),
  ]);
  if (!application) return jsonError("이미 삭제됐거나 없는 신청입니다.", 404);
  if (normalizedDocuments.error && !isMissingDocumentsRelation(normalizedDocuments.error)) {
    return jsonError("제출 서류 목록을 확인하지 못해 신청을 삭제하지 않았습니다.", 503);
  }

  const documentPaths = collectApplicationDocumentPaths(
    application,
    normalizedDocuments.error ? [] : normalizedDocuments.data ?? [],
  );

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

  // Clear storage first. If it fails, keep the request and its document rows so
  // an admin can retry without losing the only durable list of object paths.
  if (documentPaths.length) {
    const { error: storageError } = await admin.storage
      .from("account-documents")
      .remove(documentPaths);
    if (storageError) {
      return jsonError("제출 서류를 삭제하지 못해 신청 기록을 유지했습니다. 다시 시도해 주세요.", 503);
    }
  }

  const { error } = await admin.from("account_creation_requests").delete().eq("id", id);
  if (error) {
    return jsonError("제출 서류는 삭제됐지만 신청 기록을 삭제하지 못했습니다. 다시 시도해 주세요.", 500);
  }

  return NextResponse.json({ id, deleted: true });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
