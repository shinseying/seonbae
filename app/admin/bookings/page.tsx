import { redirect } from "next/navigation";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";
import AdminSidebar from "../AdminSidebar";
import BookingsPanel, { type PortalBooking } from "../../portal/BookingsPanel";
import styles from "../applications/applications.module.css";

export const dynamic = "force-dynamic";

// Every intro-call booking, newest first. The tutor sees only their own.
export default async function AdminBookingsPage() {
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
  const [{ data: rows }, { data: tutors }] = await Promise.all([
    admin
      .from("booking_requests")
      .select("id,tutor_registry_id,name,email,phone,subject,preferred_day,preferred_time,note,status,seen_by_admin,forwarded_at,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("tutors").select("registry_id,name"),
  ]);

  const tutorNames = new Map((tutors ?? []).map((row) => [row.registry_id, row.name]));
  const bookings: PortalBooking[] = (rows ?? []).map((row) => ({
    id: row.id,
    tutorName: tutorNames.get(row.tutor_registry_id) || row.tutor_registry_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    preferredDay: row.preferred_day,
    preferredTime: row.preferred_time,
    subject: row.subject,
    note: row.note,
    status: row.status,
    unread: !row.seen_by_admin,
    createdAt: row.created_at,
    forwardedAt: row.forwarded_at,
  }));

  return (
    <main className={styles.page}>
      <AdminSidebar
        active="bookings"
        adminName={profile.full_name || profile.email || "관리자"}
        styles={styles}
      />
      <section className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p>LESSON BOOKINGS</p>
            <h1>수업 예약</h1>
            <span>튜터 카드에서 접수된 수업 예약 요청입니다. 튜터에게도 메일이 발송됩니다.</span>
          </div>
          <b>{bookings.filter((booking) => booking.unread).length}건 신규</b>
        </header>
        <BookingsPanel bookings={bookings} showTutor />
      </section>
    </main>
  );
}
