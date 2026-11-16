import "server-only";

import { hourlyRateFor, lessonAmountFromRateKrw } from "./rate-lookup";
import { createClient } from "../supabase/server";
import { classroomStudentIds } from "../classrooms/students";

export type BillingLineItem = {
  id: number;
  date: string;
  title: string;
  subject: string;
  studentName: string;
  tutorName: string;
  minutes: number;
  amountKrw: number | null;
  status: "confirmed" | "scheduled";
};

// The billing page and the payment request route read the same lessons, so
// the amount a parent sees is the amount the server charges.
export async function loadBillingItems(parentId: string): Promise<BillingLineItem[]> {
  const supabase = await createClient();
  const studentIds = await classroomStudentIds(parentId);
  if (!studentIds.length) return [];

  const studentNames = new Map<string, string>();
  const { data: students } = await supabase
    .from("profiles")
    .select("id,full_name,email")
    .in("id", studentIds);
  for (const student of students ?? []) {
    studentNames.set(student.id, student.full_name || student.email || "학생");
  }

  const { data: sessions } = await supabase
    .from("portal_sessions")
    .select("id,user_id,session_date,duration_minutes,actual_minutes,title,subject,billing_rate_krw,zoom_status,tutors(name)")
    .in("user_id", studentIds)
    .neq("zoom_status", "cancelled")
    .order("session_date", { ascending: false });
  return (sessions ?? []).map((session) => {
    const tutor = Array.isArray(session.tutors) ? session.tutors[0] : session.tutors;
    return {
      id: session.id,
      date: session.session_date,
      title: session.title,
      subject: session.subject,
      studentName: studentNames.get(session.user_id) || "학생",
      tutorName: tutor?.name || "담당 튜터",
      minutes: session.actual_minutes ?? session.duration_minutes,
      amountKrw: lessonAmountFromRateKrw(
        session.billing_rate_krw ?? hourlyRateFor(session.subject),
        session.actual_minutes ?? session.duration_minutes,
      ),
      status: session.zoom_status === "ended" ? "confirmed" : "scheduled",
    };
  });
}

/** A month's lessons and total. The total is null until every lesson is priced. */
export function monthStatement(items: BillingLineItem[], month: string) {
  const monthItems = items.filter((item) => item.date.startsWith(month));
  const allPriced = monthItems.length > 0 && monthItems.every((item) => item.amountKrw !== null);
  const totalKrw = allPriced ? monthItems.reduce((sum, item) => sum + (item.amountKrw || 0), 0) : null;
  return { items: monthItems, totalKrw };
}
