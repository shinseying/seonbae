import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import AdminSidebar from "../AdminSidebar";
import SlotRequestList, { type SlotRequest } from "./SlotRequestList";
import styles from "../applications/applications.module.css";

export const dynamic = "force-dynamic";

// Tutors get three classrooms. Anything beyond that is granted here.
export default async function AdminClassroomSlotsPage() {
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
    .from("classroom_slot_requests")
    .select("id,tutor_registry_id,reason,status,granted,review_note,reviewed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const registryIds = Array.from(new Set((rows ?? []).map((row) => row.tutor_registry_id)));
  const tutorName = new Map<string, string>();
  const tutorLimit = new Map<string, number>();
  const roomCount = new Map<string, number>();
  if (registryIds.length) {
    const [{ data: tutors }, { data: rooms }] = await Promise.all([
      admin.from("tutors").select("registry_id,name,classroom_limit").in("registry_id", registryIds),
      admin.from("classrooms").select("tutor_registry_id").in("tutor_registry_id", registryIds),
    ]);
    for (const tutor of tutors ?? []) {
      tutorName.set(tutor.registry_id, tutor.name);
      tutorLimit.set(tutor.registry_id, tutor.classroom_limit ?? 3);
    }
    for (const room of rooms ?? []) {
      roomCount.set(room.tutor_registry_id, (roomCount.get(room.tutor_registry_id) ?? 0) + 1);
    }
  }

  const requests: SlotRequest[] = (rows ?? []).map((row) => ({
    id: row.id,
    registryId: row.tutor_registry_id,
    tutorName: tutorName.get(row.tutor_registry_id) || row.tutor_registry_id,
    reason: row.reason,
    status: row.status,
    granted: row.granted,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    currentLimit: tutorLimit.get(row.tutor_registry_id) ?? 3,
    currentRooms: roomCount.get(row.tutor_registry_id) ?? 0,
  }));
  const pending = requests.filter((item) => item.status === "pending").length;

  return (
    <main className={styles.page}>
      <AdminSidebar
        active="classroom-slots"
        adminName={profile.full_name || profile.email || "관리자"}
        styles={styles}
      />
      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>CLASSROOM SLOTS</p>
            <h1>추가 교실 요청</h1>
            <span>튜터는 기본 3개의 교실을 가집니다. 그 이상이 필요하면 여기에서 늘려 줍니다.</span>
          </div>
          <b>{pending}건 대기</b>
        </header>
        <SlotRequestList requests={requests} />
      </section>
    </main>
  );
}
