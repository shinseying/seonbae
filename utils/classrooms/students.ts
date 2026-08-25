import "server-only";
import { createClient } from "../supabase/server";

// Which students a parent can see. Membership of the student's classroom is
// what grants it now; parent_student_links is gone.
export async function classroomStudentIds(userId: string) {
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("classroom_members")
    .select("classroom_id")
    .eq("user_id", userId)
    .eq("status", "approved");

  const classroomIds = (memberships ?? []).map((row) => row.classroom_id);
  if (!classroomIds.length) return [];

  const { data: rooms } = await supabase
    .from("classrooms")
    .select("student_id")
    .in("id", classroomIds);

  return Array.from(new Set((rooms ?? []).map((row) => row.student_id)));
}
