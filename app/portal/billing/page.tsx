import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { lessonAmountKrw } from "../../../utils/billing/rate-lookup";
import { createClient } from "../../../utils/supabase/server";
import {
  BILLING_ACCESS_COOKIE,
  readBillingAccess,
} from "../../../utils/auth/portal-otp";
import { type BillingLineItem } from "./BillingClient";
import BillingPageContent from "./BillingPageContent";
import styles from "../parent.module.css";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,phone,role,account_status")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  if (profile?.role !== "parent") redirect("/portal");

  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const access = readBillingAccess(
    cookieStore.get(BILLING_ACCESS_COOKIE)?.value,
    user.id,
    requestHeaders,
  );

  let items: BillingLineItem[] = [];
  if (access) {
    const { data: links } = await supabase
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_id", user.id);
    const studentIds = (links ?? []).map((link) => link.student_id);
    const studentNames = new Map<string, string>();
    if (studentIds.length) {
      const { data: students } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", studentIds);
      for (const student of students ?? []) {
        studentNames.set(student.id, student.full_name || student.email || "학생");
      }

      const { data: sessions } = await supabase
        .from("portal_sessions")
        .select("id,user_id,session_date,duration_minutes,actual_minutes,title,subject,zoom_status,tutors(name)")
        .in("user_id", studentIds)
        .neq("zoom_status", "cancelled")
        .order("session_date", { ascending: false });
      items = (sessions ?? []).map((session) => {
        const tutor = Array.isArray(session.tutors) ? session.tutors[0] : session.tutors;
        return {
          id: session.id,
          date: session.session_date,
          title: session.title,
          subject: session.subject,
          studentName: studentNames.get(session.user_id) || "학생",
          tutorName: tutor?.name || "담당 튜터",
          minutes: session.actual_minutes ?? session.duration_minutes,
          amountKrw: lessonAmountKrw(session.subject, session.actual_minutes ?? session.duration_minutes),
          status: session.zoom_status === "ended" ? "confirmed" : "scheduled",
        };
      });
    }
  }

  return (
    <main className={styles.page}>
      <BillingPageContent
        locked={!access}
        accessExpiresAt={access?.expiresAt ?? null}
        methods={{ email: Boolean(profile.email || user.email), phone: Boolean(profile.phone || user.phone) }}
        items={items}
      />
    </main>
  );
}
