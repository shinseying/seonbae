import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import AdminSidebar from "../AdminSidebar";
import CardRequestList, { type CardRequest } from "./CardRequestList";
import styles from "../applications/applications.module.css";

export const dynamic = "force-dynamic";

// Tutors cannot edit their own card, so every change lands here first.
export default async function AdminCardRequestsPage() {
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

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("tutor_profile_requests")
    .select("id,tutor_registry_id,payload,note,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const registryIds = Array.from(new Set((rows ?? []).map((row) => row.tutor_registry_id)));
  const names = new Map<string, string>();
  if (registryIds.length) {
    const { data: tutors } = await admin
      .from("tutors")
      .select("registry_id,name")
      .in("registry_id", registryIds);
    for (const tutor of tutors ?? []) names.set(tutor.registry_id, tutor.name);
  }

  const requests: CardRequest[] = (rows ?? []).map((row) => ({
    id: row.id,
    registryId: row.tutor_registry_id,
    tutorName: names.get(row.tutor_registry_id) || row.tutor_registry_id,
    note: row.note,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  }));

  return (
    <main className={styles.page}>
      <AdminSidebar
        active="card-requests"
        adminName={profile.full_name || profile.email || "관리자"}
        styles={styles}
      />
      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>CARD CHANGES</p>
            <h1>카드 변경 요청</h1>
            <span>튜터가 제출한 카드 수정 요청입니다. 반영하면 공개 카드에 즉시 적용됩니다.</span>
          </div>
          <b>{requests.length}건 대기</b>
        </header>
        <CardRequestList requests={requests} />
      </section>
    </main>
  );
}
