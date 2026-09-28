import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMatchEndedEmail } from "../email/match-ended";
import { deleteZoomMeeting, ZoomApiError } from "../zoom/server";

// Ending a tutor-student match (migration 20260928030039). The classroom is
// archived, not deleted: the student and parents keep a read-only copy with a
// ZIP download for ARCHIVE_DAYS, then purgeEndedClassrooms removes it.
export const ARCHIVE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOMEWORK_BUCKET = "homework-files";

export type EndMatchResult =
  | { ok: true; cancelledLessons: number; endedAt: string; purgeAfter: string }
  | { ok: false; status: number; error: string };

type ActiveRoom = {
  id: number;
  student_id: string | null;
  tutor_registry_id: string;
  ended_at: string | null;
};

/** Lesson start as an instant; lessons are scheduled in Korean time. */
function lessonStart(sessionDate: string, startsAt: string) {
  return new Date(`${sessionDate}T${startsAt.slice(0, 5)}:00+09:00`).getTime();
}

/**
 * Cancels the pair's future lessons, deleting each Zoom meeting first, then
 * archives the room. If a Zoom meeting cannot be deleted the room is left as
 * it was, so the admin can retry; lessons already cancelled stay cancelled.
 */
export async function endClassroomMatch(
  admin: SupabaseClient,
  input: { classroomId: number; endedBy: string; reason: string | null },
): Promise<EndMatchResult> {
  const { data: room } = await admin
    .from("classrooms")
    .select("id,student_id,tutor_registry_id,ended_at")
    .eq("id", input.classroomId)
    .maybeSingle<ActiveRoom>();
  if (!room) return { ok: false, status: 404, error: "교실을 찾지 못했습니다." };
  if (room.ended_at) return { ok: false, status: 409, error: "이미 종료된 매칭입니다." };
  if (!room.student_id) return { ok: false, status: 409, error: "학생이 배정되지 않은 교실은 종료할 매칭이 없습니다." };

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: scheduled } = await admin
    .from("portal_sessions")
    .select("id,session_date,starts_at,zoom_meeting_number")
    .eq("user_id", room.student_id)
    .eq("tutor_registry_id", room.tutor_registry_id)
    .eq("zoom_status", "scheduled");
  const upcoming = (scheduled ?? []).filter(
    (lesson) => lessonStart(lesson.session_date, lesson.starts_at) > now,
  );

  let cancelledLessons = 0;
  for (const lesson of upcoming) {
    if (lesson.zoom_meeting_number) {
      try {
        await deleteZoomMeeting(lesson.zoom_meeting_number);
      } catch (zoomError) {
        if (!(zoomError instanceof ZoomApiError) || zoomError.status !== 404) {
          return {
            ok: false,
            status: 502,
            error: "예정된 수업의 Zoom 회의를 정리하지 못해 종료를 멈췄습니다. 잠시 후 다시 시도해 주세요.",
          };
        }
      }
    }
    const { error: cancelError } = await admin
      .from("portal_sessions")
      .update({
        zoom_status: "cancelled",
        cancelled_by: input.endedBy,
        cancelled_at: nowIso,
        cancellation_reason: "매칭 종료",
        updated_at: nowIso,
      })
      .eq("id", lesson.id);
    if (cancelError) return { ok: false, status: 500, error: "예정된 수업을 취소하지 못했습니다." };
    cancelledLessons += 1;
  }

  const purgeAfter = new Date(now + ARCHIVE_DAYS * DAY_MS).toISOString();
  const { data: ended, error: endError } = await admin
    .from("classrooms")
    .update({
      ended_at: nowIso,
      purge_after: purgeAfter,
      ended_by: input.endedBy,
      end_reason: input.reason,
      updated_at: nowIso,
    })
    .eq("id", room.id)
    .is("ended_at", null)
    .select("id")
    .maybeSingle();
  if (endError) return { ok: false, status: 500, error: "매칭 종료를 저장하지 못했습니다." };
  if (!ended) return { ok: false, status: 409, error: "이미 종료된 매칭입니다." };

  return { ok: true, cancelledLessons, endedAt: nowIso, purgeAfter };
}

/**
 * Deletes archives whose download window has passed: the pair's lessons and
 * homework from before the end, the homework files, and the room itself
 * (members and end requests cascade). Rows from a later re-match of the same
 * pair are newer than ended_at and stay.
 */
export async function purgeEndedClassrooms(admin: SupabaseClient, limit = 25) {
  const { data: rooms } = await admin
    .from("classrooms")
    .select("id,student_id,tutor_registry_id,ended_at")
    .not("ended_at", "is", null)
    .lt("purge_after", new Date().toISOString())
    .limit(limit);

  let purged = 0;
  let failed = 0;
  for (const room of rooms ?? []) {
    try {
      if (room.student_id) {
        const { data: homework } = await admin
          .from("portal_assignments")
          .select("id,attachment_path,student_attachment_path")
          .eq("student_id", room.student_id)
          .eq("tutor_registry_id", room.tutor_registry_id)
          .lte("created_at", room.ended_at);
        const paths = (homework ?? [])
          .flatMap((item) => [item.attachment_path, item.student_attachment_path])
          .filter((path): path is string => Boolean(path));
        if (paths.length) {
          const { error: storageError } = await admin.storage.from(HOMEWORK_BUCKET).remove(paths);
          if (storageError) throw storageError;
        }
        const homeworkIds = (homework ?? []).map((item) => item.id);
        if (homeworkIds.length) {
          const { error } = await admin.from("portal_assignments").delete().in("id", homeworkIds);
          if (error) throw error;
        }
        const { error: lessonError } = await admin
          .from("portal_sessions")
          .delete()
          .eq("user_id", room.student_id)
          .eq("tutor_registry_id", room.tutor_registry_id)
          .lte("created_at", room.ended_at);
        if (lessonError) throw lessonError;
      }
      const { error: roomError } = await admin.from("classrooms").delete().eq("id", room.id);
      if (roomError) throw roomError;
      purged += 1;
    } catch (purgeError) {
      failed += 1;
      console.error("Classroom archive purge failed", {
        classroomId: room.id,
        message: purgeError instanceof Error ? purgeError.message : "Unknown error",
      });
    }
  }
  return { purged, failed };
}

/**
 * Tells the student, every approved parent in the room and the tutor that the
 * match ended. Best effort: the end is already saved, so a failed mail is
 * logged and the rest still go out.
 */
export async function notifyMatchEnded(
  admin: SupabaseClient,
  input: { classroomId: number; cancelledLessons: number; endedAt: string; purgeAfter: string; origin: string },
) {
  const { data: room } = await admin
    .from("classrooms")
    .select("id,title,student_id,tutor_registry_id")
    .eq("id", input.classroomId)
    .maybeSingle();
  if (!room?.student_id) return { sent: 0, failed: 0 };

  const [{ data: members }, { data: tutor }, { data: tutorAccount }] = await Promise.all([
    admin
      .from("classroom_members")
      .select("user_id")
      .eq("classroom_id", room.id)
      .eq("role", "parent")
      .eq("status", "approved"),
    admin.from("tutors").select("name").eq("registry_id", room.tutor_registry_id).maybeSingle(),
    admin
      .from("profiles")
      .select("id")
      .eq("tutor_registry_id", room.tutor_registry_id)
      .eq("role", "tutor")
      .maybeSingle(),
  ]);
  const ids = [room.student_id, ...(members ?? []).map((row) => row.user_id), ...(tutorAccount ? [tutorAccount.id] : [])];
  const { data: people } = await admin.from("profiles").select("id,full_name,email").in("id", ids);
  const byId = new Map((people ?? []).map((row) => [row.id, row]));
  const studentName = byId.get(room.student_id)?.full_name || "학생";
  const tutorName = tutor?.name || "담당 튜터";
  const title = room.title || `교실 ${room.id}`;

  const recipients: Array<{ id: string; audience: "student" | "parent" | "tutor"; path: string }> = [
    { id: room.student_id, audience: "student", path: "/portal/classroom" },
    ...(members ?? []).map((row) => ({ id: row.user_id, audience: "parent" as const, path: "/portal/classroom" })),
    ...(tutorAccount ? [{ id: tutorAccount.id, audience: "tutor" as const, path: "/portal/tutor" }] : []),
  ];

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const person = byId.get(recipient.id);
    if (!person?.email) continue;
    try {
      await sendMatchEndedEmail({
        eventKey: `${room.id}-${Date.parse(input.endedAt)}-${recipient.id}`,
        to: person.email,
        name: person.full_name || person.email,
        audience: recipient.audience,
        classroomTitle: title,
        studentName,
        tutorName,
        endedAt: input.endedAt,
        availableUntil: input.purgeAfter,
        cancelledLessons: input.cancelledLessons,
        portalUrl: new URL(recipient.path, input.origin).toString(),
      });
      sent += 1;
    } catch (mailError) {
      failed += 1;
      console.error("Match-ended email failed", {
        classroomId: room.id,
        audience: recipient.audience,
        message: mailError instanceof Error ? mailError.message : "Unknown error",
      });
    }
  }
  return { sent, failed };
}
