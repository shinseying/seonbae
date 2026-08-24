import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import AdminSidebar from "../AdminSidebar";
import ComplaintList, { type Complaint } from "./ComplaintList";
import styles from "../applications/applications.module.css";

export const dynamic = "force-dynamic";

export default async function AdminComplaintsPage() {
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
    .from("complaints")
    .select("id,user_id,body,status,admin_note,created_at")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const authorIds = Array.from(new Set((rows ?? []).map((row) => row.user_id)));
  const authors = new Map<string, { name: string; role: string }>();
  if (authorIds.length) {
    const { data: people } = await admin
      .from("profiles")
      .select("id,full_name,email,role")
      .in("id", authorIds);
    for (const person of people ?? []) {
      authors.set(person.id, { name: person.full_name || person.email || "회원", role: person.role });
    }
  }

  const complaints: Complaint[] = (rows ?? []).map((row) => ({
    id: row.id,
    authorName: authors.get(row.user_id)?.name || "회원",
    authorRole: authors.get(row.user_id)?.role || "",
    body: row.body,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
  }));

  const openCount = complaints.filter((item) => item.status === "new").length;

  return (
    <main className={styles.page}>
      <AdminSidebar
        active="complaints"
        adminName={profile.full_name || profile.email || "관리자"}
        styles={styles}
      />
      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>SUPPORT</p>
            <h1>컴플레인</h1>
            <span>학생·보호자·튜터가 남긴 불편사항과 문의입니다.</span>
          </div>
          <b>{openCount}건 대기</b>
        </header>
        <ComplaintList complaints={complaints} styles={styles} />
      </section>
    </main>
  );
}
