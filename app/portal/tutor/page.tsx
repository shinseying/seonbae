import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { requireSignedTutorContract } from "../../../utils/contracts/tutor-signature";
import type { PortalChatThread } from "../ChatPanel";
import type { ClassroomOption, PortalBooking } from "../BookingsPanel";
import { createAdminClient } from "../../../utils/supabase/admin";
import TutorPortalDashboard, {
  type TutorPortalSession,
} from "./TutorPortalDashboard";

export const dynamic = "force-dynamic";

export default async function TutorPortalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,tutor_registry_id,account_status")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") redirect("/admin");
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  if (profile?.role !== "tutor" || !profile.tutor_registry_id) {
    redirect("/portal");
  }

  // The contract gates the account: an approved tutor still cannot use the
  // portal until the current version is signed.
  await requireSignedTutorContract(user.id);

  const [{ data: sessionRows }, { data: threadRows }, { data: bookingRows }] = await Promise.all([
    supabase
      .from("portal_sessions")
      .select(
        "id,user_id,session_date,starts_at,duration_minutes,actual_minutes,subject,title,session_type,location,notes,zoom_meeting_number,zoom_status",
      )
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .order("session_date", { ascending: true })
      .order("starts_at", { ascending: true }),
    supabase
      .from("chat_threads")
      .select("id,student_id")
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("booking_requests")
      .select("id,name,email,phone,subject,preferred_day,preferred_time,note,status,seen_by_tutor,created_at")
      .eq("tutor_registry_id", profile.tutor_registry_id)
      .not("forwarded_at", "is", null)
      // Answered matches leave the list; without this they came back on refresh.
      .is("decided_at", null)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const bookings: PortalBooking[] = (bookingRows ?? []).map((row) => ({
    id: row.id,
    tutorName: "",
    name: row.name,
    email: row.email,
    phone: row.phone,
    preferredDay: row.preferred_day,
    preferredTime: row.preferred_time,
    subject: row.subject,
    note: row.note,
    status: row.status,
    unread: !row.seen_by_tutor,
    createdAt: row.created_at,
  }));

  // Rooms the tutor can drop an accepted match into.
  const { data: roomRows } = await createAdminClient()
    .from("classrooms")
    .select("id,title,student_id")
    .eq("tutor_registry_id", profile.tutor_registry_id)
    .order("created_at", { ascending: true });
  const classroomOptions: ClassroomOption[] = (roomRows ?? []).map((row) => ({
    id: row.id,
    title: row.title || `교실 ${row.id}`,
    hasSeat: Boolean(row.student_id),
  }));

  const studentIds = Array.from(
    new Set([
      ...(sessionRows ?? []).map((row) => row.user_id),
      ...(threadRows ?? []).map((row) => row.student_id),
    ]),
  );
  const studentMap = new Map<
    string,
    { full_name: string | null; email: string }
  >();
  if (studentIds.length) {
    const { data: students } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", studentIds);
    for (const student of students ?? []) studentMap.set(student.id, student);
  }

  const sessions: TutorPortalSession[] = (sessionRows ?? []).map((row) => ({
    id: row.id,
    studentName:
      studentMap.get(row.user_id)?.full_name
      || studentMap.get(row.user_id)?.email
      || "학생",
    sessionDate: row.session_date,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    actualMinutes: row.actual_minutes,
    subject: row.subject,
    title: row.title,
    sessionType: row.session_type,
    location: row.location,
    notes: row.notes,
    zoomMeetingNumber: row.zoom_meeting_number,
    zoomStatus: row.zoom_status,
  }));

  const chatThreads: PortalChatThread[] = (threadRows ?? []).map((row) => ({
    id: row.id,
    counterpartName:
      studentMap.get(row.student_id)?.full_name
      || studentMap.get(row.student_id)?.email
      || "학생",
    counterpartMeta: "수강 학생",
  }));

  return (
    <TutorPortalDashboard
      currentUserId={user.id}
      tutor={{
        name:
          profile.full_name
          || user.user_metadata?.full_name
          || user.email?.split("@")[0]
          || "튜터",
        email: profile.email || user.email || "",
        registryId: profile.tutor_registry_id,
      }}
      sessions={sessions}
      chatThreads={chatThreads}
      bookings={bookings}
      classrooms={classroomOptions}
    />
  );
}
