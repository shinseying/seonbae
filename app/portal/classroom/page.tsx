import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import ClassroomView, {
  type Classroom,
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
  let classroomLimit = 3;
  let slotRequestPending = false;
  let matchRequests: MatchRequest[] = [];

  // Which rooms this person can see depends on how they belong to them.
  let classroomIds: number[] = [];
  if (role === "student") {
    const { data } = await admin.from("classrooms").select("id").eq("student_id", user.id);
    classroomIds = (data ?? []).map((row) => row.id);
  } else if (role === "tutor" && profile.tutor_registry_id) {
    // An ended match leaves the tutor's list; the student and parents keep it.
    const { data } = await admin
      .from("classrooms")
      .select("id")
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .is("ended_at", null);
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
      .select("id,student_id,tutor_registry_id,title,ended_at")
      .in("id", classroomIds);

    const studentIds = Array.from(
      new Set((rows ?? []).map((row) => row.student_id).filter(Boolean) as string[]),
    );
    const registryIds = Array.from(new Set((rows ?? []).map((row) => row.tutor_registry_id)));

    const [{ data: students }, { data: tutors }, { data: sessions }, { data: homework }, { data: joinRequests }, { data: bookings }, { data: reads, error: readsError }] =
      await Promise.all([
        studentIds.length
          ? admin.from("profiles").select("id,full_name,email").in("id", studentIds)
          : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string }> }),
        admin.from("tutors").select("registry_id,name").in("registry_id", registryIds),
        studentIds.length
          ? admin
              .from("portal_sessions")
              .select("user_id,tutor_registry_id,subject,zoom_status,recording_url,cancelled_at,cancelled_by,created_at,updated_at")
              .in("user_id", studentIds)
              .order("session_date", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length
          ? admin
              .from("portal_assignments")
              .select("student_id,tutor_registry_id,created_at,submitted_at,graded_at,returned_for_revision_at")
              .in("student_id", studentIds)
          : Promise.resolve({ data: [] as any[] }),
        role === "tutor"
          ? admin
              .from("classroom_members")
              .select("classroom_id,requested_at")
              .in("classroom_id", classroomIds)
              .eq("status", "pending")
          : Promise.resolve({ data: [] as Array<{ classroom_id: number; requested_at: string }> }),
        admin
          .from("booking_requests")
          .select("classroom_id,subject")
          .in("classroom_id", classroomIds)
          .eq("status", "accepted"),
        admin
          .from("classroom_reads")
          .select("classroom_id,last_seen_at")
          .eq("user_id", user.id)
          .in("classroom_id", classroomIds),
      ]);

    const studentName = new Map((students ?? []).map((row) => [row.id, row.full_name || row.email || "학생"]));
    const tutorName = new Map((tutors ?? []).map((row) => [row.registry_id, row.name]));
    const bookingSubject = new Map((bookings ?? []).map((row) => [row.classroom_id, row.subject]));
    const lastSeen = new Map((reads ?? []).map((row) => [row.classroom_id, row.last_seen_at]));

    classrooms = (rows ?? []).map((row) => {
      // An archive holds what existed when the match ended, not a later re-match.
      const belongs = (item: { user_id?: string; student_id?: string; tutor_registry_id: string; created_at?: string }) =>
        Boolean(row.student_id)
        && (item.user_id ?? item.student_id) === row.student_id
        && item.tutor_registry_id === row.tutor_registry_id
        && (!row.ended_at || !item.created_at || Date.parse(item.created_at) <= Date.parse(row.ended_at));
      const lessons = (sessions ?? []).filter(belongs);
      const work = (homework ?? []).filter(belongs);

      // The dot reports what someone else did, never the reader's own action.
      const isTutor = role === "tutor";
      const updates: Array<string | null> = [
        ...lessons.flatMap((item) => [
          isTutor ? null : item.created_at,
          item.cancelled_by === user.id ? null : item.cancelled_at,
          !isTutor && item.recording_url ? item.updated_at : null,
        ]),
        ...work.flatMap((item) => (isTutor
          ? [item.submitted_at]
          : [item.created_at, item.graded_at, item.returned_for_revision_at, role === "parent" ? item.submitted_at : null])),
        ...(joinRequests ?? []).filter((item) => item.classroom_id === row.id).map((item) => item.requested_at),
        isTutor ? null : row.ended_at,
      ];

      return {
        id: row.id,
        title: row.title || `${row.student_id ? studentName.get(row.student_id) : "빈 자리"} · ${tutorName.get(row.tutor_registry_id) || row.tutor_registry_id}`,
        // Classrooms have no subject of their own: the latest lesson names it,
        // and until there is one, the match request that filled the seat.
        subject: lessons.find((item) => item.zoom_status !== "cancelled")?.subject || bookingSubject.get(row.id) || "",
        studentName: row.student_id ? (studentName.get(row.student_id) || "학생") : "",
        // Without read state every room would look new forever, so show nothing.
        updatedAt: readsError ? null : unseenUpdate(updates, lastSeen.get(row.id)),
      };
    });
  }

  return (
    <main className={styles.page}>
      <ClassroomView
        role={role}
        classrooms={classrooms}
        matchRequests={matchRequests}
        classroomLimit={classroomLimit}
        slotRequestPending={slotRequestPending}
      />
    </main>
  );
}

function unseenUpdate(updates: Array<string | null>, seenAt: string | undefined) {
  const newest = updates.reduce<string | null>(
    (latest, value) => (value && (!latest || Date.parse(value) > Date.parse(latest)) ? value : latest),
    null,
  );
  return newest && (!seenAt || Date.parse(newest) > Date.parse(seenAt)) ? newest : null;
}
