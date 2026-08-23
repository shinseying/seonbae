import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import AdminTutorEditor, { type AdminTutor } from "./AdminTutorEditor";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/portal");

  const { data } = await supabase
    .from("tutors")
    .select(
      "registry_id,name,exam,score,category,tier,university,university_en,photo_url,banner_url,zoom_host_email,display_order,active,subject_scores,availability,bio,bio_en,video_url,languages,lesson_format",
    )
    .order("display_order", { ascending: true })
    .order("registry_id", { ascending: true });

  return (
    <AdminTutorEditor
      adminName={profile.full_name || profile.email || user.email || "관리자"}
      initialTutors={(data ?? []) as AdminTutor[]}
    />
  );
}
