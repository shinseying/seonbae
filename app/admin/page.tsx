import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import AdminTutorEditor, { type AdminTutor, type AdminAccount } from "./AdminTutorEditor";

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

  // Cards are assigned to accounts by hand, so the editor needs the roster of
  // accounts that could hold one. Admins are excluded: an admin account never
  // owns a tutor card.
  const [{ data }, { data: accountRows }] = await Promise.all([
    supabase
      .from("tutors")
      .select(
        "registry_id,name,exam,score,category,university,university_en,photo_url,banner_url,zoom_host_email,display_order,active,subject_scores,availability,bio,bio_en,video_url,languages,lesson_format",
      )
      .order("display_order", { ascending: true })
      .order("registry_id", { ascending: true }),
    supabase
      .from("profiles")
      .select("id,full_name,email,role,tutor_registry_id")
      .neq("role", "admin")
      .order("full_name", { ascending: true }),
  ]);

  return (
    <AdminTutorEditor
      adminName={profile.full_name || profile.email || user.email || "관리자"}
      initialTutors={(data ?? []) as AdminTutor[]}
      accounts={(accountRows ?? []) as AdminAccount[]}
    />
  );
}
