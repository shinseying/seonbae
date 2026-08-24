import { redirect } from "next/navigation";
import { createClient } from "../../../../utils/supabase/server";
import { requireSignedTutorContract } from "../../../../utils/contracts/tutor-signature";
import { PortalText } from "../../PortalLocale";
import TutorProfileForm, { type PendingRequest, type TutorProfile } from "./TutorProfileForm";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

// Everything the public tutor card renders, edited by the tutor who owns it.
export default async function TutorProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status,tutor_registry_id")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  if (profile?.role !== "tutor" || !profile.tutor_registry_id) redirect("/portal");

  // The contract gates the account: an approved tutor still cannot use the
  // portal until the current version is signed.
  await requireSignedTutorContract(user.id);

  const { data: row } = await supabase
    .from("tutors")
    .select("name,university,photo_url,exam,score,availability,subject_scores,bio,bio_en,video_url,languages,lesson_format")
    .eq("registry_id", profile.tutor_registry_id)
    .single();

  const current: TutorProfile = {
    registryId: profile.tutor_registry_id,
    name: row?.name ?? "",
    university: row?.university ?? "",
    photoUrl: row?.photo_url ?? null,
    exam: row?.exam ?? "",
    score: row?.score ?? "",
    availability: (row?.availability as Record<string, string[]>) ?? {},
    subjectScores: (row?.subject_scores as Array<{ subject: string; score: string }>) ?? [],
    bio: row?.bio ?? "",
    bioEn: row?.bio_en ?? "",
    videoUrl: row?.video_url ?? "",
    languages: row?.languages ?? "",
    lessonFormat: row?.lesson_format ?? "",
  };

  const { data: openRequest } = await supabase
    .from("tutor_profile_requests")
    .select("created_at,note")
    .eq("tutor_registry_id", profile.tutor_registry_id)
    .eq("status", "pending")
    .maybeSingle();

  const pending: PendingRequest = openRequest
    ? { createdAt: openRequest.created_at, note: openRequest.note }
    : null;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.heading}>
          <p>PROFILE</p>
          <h1><PortalText ko="내 카드 관리" en="My tutor card" /></h1>
          <span>
            <PortalText
              ko="공개 카드에 표시되는 내용입니다. 수정은 관리자 검토를 거쳐 반영됩니다."
              en="This is what visitors see. Changes are applied by an admin after review."
            />
          </span>
        </header>
        <TutorProfileForm profile={current} pending={pending} />
      </section>
    </main>
  );
}
