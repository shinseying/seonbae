import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const TUTOR_APPLICATION_SELECT =
  "id,user_id,email,full_name,requested_role,status,university,subjects,curriculum,official_score,introduction,subject_scores,languages,lesson_format,created_at";

export type TutorApplicationLinkProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  account_status: string | null;
  account_reviewed_at?: string | null;
};

export type TutorApplicationRecord = {
  id: number;
  user_id: string | null;
  email: string;
  full_name: string;
  requested_role: string;
  status: string;
  university: string | null;
  subjects: string | null;
  curriculum: string | null;
  official_score: string | null;
  introduction: string | null;
  subject_scores: unknown;
  languages: string | null;
  lesson_format: string | null;
  created_at: string;
};

export type TutorApplicationRepair = {
  application: TutorApplicationRecord;
  action: "existing" | "linked" | "created";
};

export class TutorApplicationLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorApplicationLinkError";
  }
}

// Older tutor accounts can pre-date application-linked provisioning. The
// contract audit row requires an application id, so recover a single exact
// email match when possible and otherwise create an explicit legacy audit row
// for an already-approved tutor. Ambiguous or rejected records are left for an
// administrator instead of being silently rewritten.
export async function ensureTutorApplicationRecord(
  admin: SupabaseClient,
  userId: string,
  profile: TutorApplicationLinkProfile,
): Promise<TutorApplicationRepair> {
  if (profile.role !== "tutor") {
    throw new TutorApplicationLinkError("튜터 계정이 아닙니다.");
  }

  const { data: linked, error: linkedError } = await admin
    .from("account_creation_requests")
    .select(TUTOR_APPLICATION_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  if (linkedError) throw new TutorApplicationLinkError("연결된 지원 기록을 확인하지 못했습니다.");

  if (linked) {
    if (linked.requested_role !== "tutor") {
      throw new TutorApplicationLinkError("기존 가입 기록의 계정 유형을 관리자가 확인해야 합니다.");
    }
    return { application: linked as TutorApplicationRecord, action: "existing" };
  }

  const email = profile.email?.trim().toLowerCase() || "";
  if (!email) throw new TutorApplicationLinkError("계정 이메일을 확인하지 못했습니다.");

  const { data: candidates, error: candidateError } = await admin
    .from("account_creation_requests")
    .select(TUTOR_APPLICATION_SELECT)
    .eq("email", email)
    .eq("requested_role", "tutor")
    .is("user_id", null)
    .order("created_at", { ascending: false })
    .limit(3);
  if (candidateError) throw new TutorApplicationLinkError("기존 지원 기록을 검색하지 못했습니다.");

  if ((candidates?.length ?? 0) > 1) {
    throw new TutorApplicationLinkError("같은 이메일의 지원 기록이 여러 건이라 관리자 확인이 필요합니다.");
  }

  const candidate = candidates?.[0] as TutorApplicationRecord | undefined;
  if (candidate) {
    if (candidate.status === "rejected") {
      throw new TutorApplicationLinkError("보완 요청된 지원 기록은 자동으로 연결할 수 없습니다.");
    }

    const now = new Date().toISOString();
    const { data: recovered, error: recoverError } = await admin
      .from("account_creation_requests")
      .update({
        user_id: userId,
        ...(profile.account_status === "approved"
          ? {
              status: "approved",
              reviewed_at: profile.account_reviewed_at || now,
            }
          : {}),
        updated_at: now,
      })
      .eq("id", candidate.id)
      .is("user_id", null)
      .select(TUTOR_APPLICATION_SELECT)
      .single();
    if (recoverError || !recovered) {
      throw new TutorApplicationLinkError("기존 지원 기록을 계정에 연결하지 못했습니다.");
    }
    return { application: recovered as TutorApplicationRecord, action: "linked" };
  }

  if (profile.account_status !== "approved") {
    throw new TutorApplicationLinkError("승인 전 계정에는 지원 기록을 자동 생성할 수 없습니다.");
  }

  const now = new Date().toISOString();
  const { data: created, error: createError } = await admin
    .from("account_creation_requests")
    .insert({
      user_id: userId,
      full_name: profile.full_name?.trim() || email.split("@")[0],
      email,
      phone: profile.phone || "",
      requested_role: "tutor",
      status: "approved",
      reviewed_at: profile.account_reviewed_at || now,
      review_note: "기존 승인 튜터 계정의 계약 연결 복구를 위해 생성된 기록입니다.",
      created_at: now,
      updated_at: now,
    })
    .select(TUTOR_APPLICATION_SELECT)
    .single();
  if (createError || !created) {
    throw new TutorApplicationLinkError("계약에 필요한 지원 기록을 복구하지 못했습니다.");
  }

  return { application: created as TutorApplicationRecord, action: "created" };
}
