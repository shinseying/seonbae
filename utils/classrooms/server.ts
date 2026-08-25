import "server-only";
import { randomBytes } from "node:crypto";

// A classroom is the student/tutor pair that homework, lessons, and chat are
// already keyed on. It exists so a parent can join with a code the tutor hands
// out, instead of being linked to the student's account.
type AdminClient = {
  from: (table: string) => any;
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function token(length: number) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

// Called whenever a lesson is scheduled, so the classroom exists before anyone
// needs its code. Returns the row either way.
export async function ensureClassroom(
  admin: AdminClient,
  studentId: string,
  tutorRegistryId: string,
  title?: string | null,
) {
  const { data: existing } = await admin
    .from("classrooms")
    .select("id,join_code,join_password")
    .eq("student_id", studentId)
    .eq("tutor_registry_id", tutorRegistryId)
    .maybeSingle();
  if (existing) return existing;

  const { data } = await admin
    .from("classrooms")
    .insert({
      join_code: `C-${token(6)}`,
      join_password: token(8),
      student_id: studentId,
      tutor_registry_id: tutorRegistryId,
      title: title || null,
    })
    .select("id,join_code,join_password")
    .single();
  return data ?? null;
}
