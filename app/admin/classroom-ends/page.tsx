import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import AdminSidebar from "../AdminSidebar";
import ClassroomEndList, { type ActiveMatch, type EndRequest, type EndedMatch } from "./ClassroomEndList";
import styles from "../applications/applications.module.css";

export const dynamic = "force-dynamic";

// Ending a tutor-student match: requests from students, parents and tutors,
// plus every running match so the admin can end one directly.
export default async function AdminClassroomEndsPage() {
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
  const [{ data: requestRows }, { data: roomRows }] = await Promise.all([
    admin
      .from("classroom_end_requests")
      .select("id,classroom_id,requested_by,requester_role,reason,status,reviewed_at,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("classrooms")
      .select("id,title,student_id,tutor_registry_id,ended_at,purge_after,end_reason")
      .not("student_id", "is", null)
      .order("created_at", { ascending: true }),
  ]);

  const rooms = roomRows ?? [];
  const personIds = Array.from(new Set([
    ...rooms.map((room) => room.student_id as string),
    ...(requestRows ?? []).map((row) => row.requested_by),
  ]));
  const registryIds = Array.from(new Set(rooms.map((room) => room.tutor_registry_id)));
  const [{ data: people }, { data: tutors }] = await Promise.all([
    personIds.length
      ? admin.from("profiles").select("id,full_name,email").in("id", personIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string }> }),
    registryIds.length
      ? admin.from("tutors").select("registry_id,name,roster_number").in("registry_id", registryIds)
      : Promise.resolve({ data: [] as Array<{ registry_id: string; name: string; roster_number: string | null }> }),
  ]);
  const personName = new Map((people ?? []).map((row) => [row.id, row.full_name || row.email || "회원"]));
  const tutorLabel = new Map((tutors ?? []).map((row) => [row.registry_id, `${row.name} · ${row.roster_number || row.registry_id}`]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const roomLabel = (id: number) => {
    const room = roomById.get(id);
    if (!room) return { title: `교실 ${id}`, student: "-", tutor: "-" };
    return {
      title: room.title || `교실 ${room.id}`,
      student: personName.get(room.student_id as string) || "학생",
      tutor: tutorLabel.get(room.tutor_registry_id) || room.tutor_registry_id,
    };
  };

  const requests: EndRequest[] = (requestRows ?? []).map((row) => ({
    id: row.id,
    ...roomLabel(row.classroom_id),
    requester: personName.get(row.requested_by) || "회원",
    requesterRole: row.requester_role,
    reason: row.reason,
    status: row.status,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }));
  const active: ActiveMatch[] = rooms
    .filter((room) => !room.ended_at)
    .map((room) => ({ id: room.id, ...roomLabel(room.id) }));
  const ended: EndedMatch[] = rooms
    .filter((room) => room.ended_at)
    .map((room) => ({
      id: room.id,
      ...roomLabel(room.id),
      endedAt: room.ended_at as string,
      purgeAfter: room.purge_after as string,
      reason: room.end_reason,
    }));
  const pending = requests.filter((item) => item.status === "pending").length;

  return (
    <main className={styles.page}>
      <AdminSidebar
        active="classroom-ends"
        adminName={profile.full_name || profile.email || "관리자"}
        styles={styles}
      />
      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>MATCH ENDINGS</p>
            <h1>매칭 종료</h1>
            <span>
              종료하면 예정된 수업과 Zoom 회의가 취소되고 교실은 보관 상태가 됩니다. 학생과
              보호자는 7일 동안 기록을 보고 내려받을 수 있으며, 그 뒤 기록과 파일이 삭제됩니다.
            </span>
          </div>
          <b>{pending}건 대기</b>
        </header>
        <ClassroomEndList requests={requests} active={active} ended={ended} />
      </section>
    </main>
  );
}
