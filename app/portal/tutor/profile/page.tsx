import { redirect } from "next/navigation";
import { createClient } from "../../../../utils/supabase/server";
import { PortalText } from "../../PortalLocale";
import TutorProfileForm, { type TutorProfile } from "./TutorProfileForm";
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

  const { data: row } = await supabase
    .from("tutors")
    .select("availability,subject_scores,bio,bio_en,video_url,languages,lesson_format")
    .eq("registry_id", profile.tutor_registry_id)
    .single();

  const current: TutorProfile = {
    availability: (row?.availability as Record<string, string[]>) ?? {},
    subjectScores: (row?.subject_scores as Array<{ subject: string; score: string }>) ?? [],
    bio: row?.bio ?? "",
    bioEn: row?.bio_en ?? "",
    videoUrl: row?.video_url ?? "",
    languages: row?.languages ?? "",
    lessonFormat: row?.lesson_format ?? "",
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.heading}>
          <p>PROFILE</p>
          <h1><PortalText ko="내 카드 관리" en="My tutor card" /></h1>
          <span>
            <PortalText
              ko="여기서 저장한 내용이 선배 찾기 페이지의 카드에 그대로 표시됩니다."
              en="What you save here is what visitors see on your card in the tutor directory."
            />
          </span>
        </header>
        <TutorProfileForm profile={current} />
      </section>
    </main>
  );
}
