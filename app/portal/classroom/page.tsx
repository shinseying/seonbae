import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import ClassroomView, {
  type Classroom,
  type JoinRequest,
  type MatchRequest,
} from "./ClassroomView";
import styles from "./classroom.module.css";

export const dynamic = "force-dynamic";

// 내 교실 replaces the separate "my tutors" and "my students" screens: the
// student, the tutor, and any approved parent all read the same room.
export default async function ClassroomPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,account_status,tutor_registry_id,full_name")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  if (profile.role === "admin") redirect("/admin");

  const admin = createAdminClient();
  const role = profile.role as "student" | "parent" | "tutor";

  let classrooms: Classroom[] = [];
  let pendingRequests: JoinRequest[] = [];
  let classroomLimit = 3;
  let slotRequestPending = false;
  let matchRequests: MatchRequest[] = [];

  // Which rooms this person can see depends on how they belong to them.
  let classroomIds: number[] = [];
  if (role === "student") {
    const { data } = await admin.from("classrooms").select("id").eq("student_id", user.id);
    classroomIds = (data ?? []).map((row) => row.id);
  } else if (role === "tutor" && profile.tutor_registry_id) {
    const { data } = await admin
      .from("classrooms")
      .select("id")
      .eq("tutor_registry_id", profile.tutor_registry_id);
    classroomIds = (data ?? []).map((row) => row.id);
    const { data: tutorRow } = await admin
      .from("tutors")
      .select("classroom_limit")
      .eq("registry_id", profile.tutor_registry_id)
      .maybeSingle();
    classroomLimit = tutorRow?.classroom_limit ?? 3;
    const { data: slotRequest } = await admin
      .from("classroom_slot_requests")
      .select("status")
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .eq("status", "pending")
      .maybeSingle();
    slotRequestPending = Boolean(slotRequest);

    // Matches the admin passed on and the tutor has not answered yet.
    const { data: bookingRows } = await admin
      .from("booking_requests")
      .select("id,name,email,subject,preferred_day,preferred_time,note,status,created_at")
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .not("forwarded_at", "is", null)
      .in("status", ["new", "contacted", "scheduled"])
      .order("created_at", { ascending: false });
    matchRequests = (bookingRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      subject: row.subject,
      preferredDay: row.preferred_day,
      preferredTime: row.preferred_time,
      note: row.note,
      createdAt: row.created_at,
    }));
  } else {
    const { data } = await admin
      .from("classroom_members")
      .select("classroom_id")
      .eq("user_id", user.id)
      .eq("status", "approved");
    classroomIds = (data ?? []).map((row) => row.classroom_id);
  }

  if (classroomIds.length) {
    const { data: rows } = await admin
      .from("classrooms")
      .select("id,join_code,join_password,student_id,tutor_registry_id,title")
      .in("id", classroomIds);

    const studentIds = Array.from(
      new Set((rows ?? []).map((row) => row.student_id).filter(Boolean) as string[]),
    );
    const registryIds = Array.from(new Set((rows ?? []).map((row) => row.tutor_registry_id)));

    const [{ data: students }, { data: tutors }, { data: sessions }, { data: homework }, { data: members }] =
      await Promise.all([
        studentIds.length
          ? admin.from("profiles").select("id,full_name,email").in("id", studentIds)
          : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string }> }),
        admin.from("tutors").select("registry_id,name").in("registry_id", registryIds),
        studentIds.length
          ? admin
              .from("portal_sessions")
              .select("id,user_id,tutor_registry_id,session_date,starts_at,subject,title,notes,zoom_status,recording_url")
              .in("user_id", studentIds)
              .order("session_date", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length
          ? admin
              .from("portal_assignments")
              .select("id,student_id,tutor_registry_id,title,due_date,status,feedback")
              .in("student_id", studentIds)
              .order("due_date", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        admin
          .from("classroom_members")
          .select("id,classroom_id,user_id,role,status,requested_at")
          .in("classroom_id", classroomIds),
      ]);

    const studentName = new Map((students ?? []).map((row) => [row.id, row.full_name || row.email || "학생"]));
    const tutorName = new Map((tutors ?? []).map((row) => [row.registry_id, row.name]));
    const memberName = new Map((students ?? []).map((row) => [row.id, row.full_name || row.email || "회원"]));

    // A tutor decides join requests, so their pending list is gathered here.
    if (role === "tutor") {
      const pending = (members ?? []).filter((row) => row.status === "pending");
      const requesterIds = pending.map((row) => row.user_id);
      if (requesterIds.length) {
        const { data: requesters } = await admin
          .from("profiles")
          .select("id,full_name,email,role")
          .in("id", requesterIds);
        for (const person of requesters ?? []) memberName.set(person.id, person.full_name || person.email || "회원");
      }
      pendingRequests = pending.map((row) => ({
        id: row.id,
        classroomId: row.classroom_id,
        name: memberName.get(row.user_id) || "회원",
        role: row.role,
        requestedAt: row.requested_at,
      }));
    }

    classrooms = (rows ?? []).map((row) => {
      const belongs = (item: { user_id?: string; student_id?: string; tutor_registry_id: string }) =>
        Boolean(row.student_id)
        && (item.user_id ?? item.student_id) === row.student_id
        && item.tutor_registry_id === row.tutor_registry_id;

      return {
        id: row.id,
        title: row.title || `${row.student_id ? studentName.get(row.student_id) : "빈 자리"} · ${tutorName.get(row.tutor_registry_id) || row.tutor_registry_id}`,
        studentName: row.student_id ? (studentName.get(row.student_id) || "학생") : "",
        tutorName: tutorName.get(row.tutor_registry_id) || row.tutor_registry_id,
        // Only the tutor and the student hand the code out.
        joinCode: role === "parent" ? null : row.join_code,
        joinPassword: role === "parent" ? null : row.join_password,
        lessons: (sessions ?? []).filter(belongs).map((item) => ({
          id: item.id,
          date: item.session_date,
          startsAt: item.starts_at,
          subject: item.subject,
          title: item.title,
          notes: item.notes,
          status: item.zoom_status,
          recordingUrl: item.recording_url,
        })),
        homework: (homework ?? []).filter(belongs).map((item) => ({
          id: item.id,
          title: item.title,
          dueDate: item.due_date,
          status: item.status,
          feedback: item.feedback,
        })),
        members: (members ?? [])
          .filter((item) => item.classroom_id === row.id && item.status === "approved")
          .map((item) => ({ id: item.id, name: memberName.get(item.user_id) || "회원", role: item.role })),
      };
    });
  }

  return (
    <main className={styles.page}>
      <ClassroomView
        role={role}
        classrooms={classrooms}
        pendingRequests={pendingRequests}
        matchRequests={matchRequests}
        classroomLimit={classroomLimit}
        slotRequestPending={slotRequestPending}
      />
    </main>
  );
}
