import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import PortalDashboard, {
  type PortalConsultation,
  type PortalSession,
  type PortalConsultationRequest,
} from "./PortalDashboard";
import type { PortalChatThread } from "./ChatPanel";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
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
  if (profile?.role === "tutor") redirect("/portal/tutor");

  const isParent = profile?.role === "parent";
  let studentIds = [user.id];
  const studentNames = new Map<string, string>();

  if (isParent) {
    const { data: links } = await supabase
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_id", user.id);
    studentIds = (links ?? []).map((link) => link.student_id);

    if (studentIds.length) {
      const { data: students } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", studentIds);
      for (const student of students ?? []) {
        studentNames.set(
          student.id,
          student.full_name || student.email || "학생",
        );
      }
    }
  } else {
    studentNames.set(
      user.id,
      profile?.full_name
        || user.user_metadata?.full_name
        || user.email?.split("@")[0]
        || "학생",
    );
  }

  const sessionSelect =
    "id,user_id,session_date,starts_at,duration_minutes,actual_minutes,subject,title,session_type,location,notes,tutor_registry_id,zoom_meeting_number,zoom_status,tutors(name,university,photo_url)";
  const { data: sessionRows } = studentIds.length
    ? await supabase
        .from("portal_sessions")
        .select(sessionSelect)
        .in("user_id", studentIds)
        .order("session_date", { ascending: true })
        .order("starts_at", { ascending: true })
    : { data: [] };

  const sessions: PortalSession[] = (sessionRows ?? []).map((row) => {
    const tutor = Array.isArray(row.tutors) ? row.tutors[0] : row.tutors;
    return {
      id: row.id,
      studentName: studentNames.get(row.user_id) || "학생",
      sessionDate: row.session_date,
      startsAt: row.starts_at,
      durationMinutes: row.duration_minutes,
      actualMinutes: row.actual_minutes,
      subject: row.subject,
      title: row.title,
      sessionType: row.session_type,
      location: row.location,
      notes: row.notes,
      tutorRegistryId: row.tutor_registry_id,
      zoomMeetingNumber: row.zoom_meeting_number,
      zoomStatus: row.zoom_status,
      tutor: tutor
        ? {
            name: tutor.name,
            university: tutor.university,
            photoUrl: tutor.photo_url,
          }
        : null,
    };
  });

  let consultations: PortalConsultation[] = [];
  if (isParent) {
    const { data } = await supabase
      .from("consultation_requests")
      .select(
        "id,session_date,starts_at,duration_minutes,actual_minutes,subject,meeting_title,notes,zoom_meeting_number,zoom_status",
      )
      .eq("user_id", user.id)
      .not("zoom_meeting_number", "is", null)
      .order("session_date", { ascending: true })
      .order("starts_at", { ascending: true });
    consultations = (data ?? []).map((row) => ({
      id: row.id,
      sessionDate: row.session_date,
      startsAt: row.starts_at,
      durationMinutes: row.duration_minutes,
      actualMinutes: row.actual_minutes,
      topic: row.subject,
      title: row.meeting_title,
      notes: row.notes,
      zoomMeetingNumber: row.zoom_meeting_number,
      zoomStatus: row.zoom_status,
    }));
  }

  // The requests the parent filed themselves, before anything is scheduled.
  // A request sent while signed out has no user_id, so it cannot appear here.
  let consultationRequests: PortalConsultationRequest[] = [];
  if (isParent) {
    const { data } = await supabase
      .from("consultation_requests")
      .select("id,subject,curriculum,goals,status,created_at")
      .eq("user_id", user.id)
      .is("zoom_meeting_number", null)
      .order("created_at", { ascending: false });
    consultationRequests = (data ?? []).map((row) => ({
      id: row.id,
      subject: row.subject,
      curriculum: row.curriculum,
      goals: row.goals,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  let chatThreads: PortalChatThread[] = [];
  if (!isParent) {
    const { data: rows } = await supabase
      .from("chat_threads")
      .select("id,tutor_registry_id,tutors(name,university)")
      .eq("student_id", user.id)
      .order("updated_at", { ascending: false });
    chatThreads = (rows ?? []).map((row) => {
      const tutor = Array.isArray(row.tutors) ? row.tutors[0] : row.tutors;
      return {
        id: row.id,
        counterpartName: tutor?.name || "담당 튜터",
        counterpartMeta: tutor?.university || row.tutor_registry_id,
      };
    });
  }

  return (
    <PortalDashboard
      currentUserId={user.id}
      user={{
        name:
          profile?.full_name
          || user.user_metadata?.full_name
          || user.email?.split("@")[0]
          || "회원",
        email: profile?.email || user.email || "",
        role: isParent ? "parent" : "student",
      }}
      sessions={sessions}
      consultations={consultations}
      consultationRequests={consultationRequests}
      chatThreads={chatThreads}
      linkedStudentCount={isParent ? studentIds.length : 0}
    />
  );
}
