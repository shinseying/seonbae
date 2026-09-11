import { redirect } from "next/navigation";
import { createClient } from "../../../utils/supabase/server";
import { PortalDateTime, PortalText } from "../PortalLocale";
import styles from "./tutors.module.css";

export const dynamic = "force-dynamic";

export default async function StudentTutorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,role,account_status")
    .eq("id", user.id)
    .single();
  if (profile?.account_status !== "approved") redirect("/portal/pending");
  if (profile?.role !== "student") redirect("/portal");

  const { data: sessions } = await supabase
    .from("portal_sessions")
    .select("tutor_registry_id,subject,session_date,starts_at,tutors(name,university,photo_url,exam,score,roster_number)")
    .eq("user_id", user.id)
    .neq("zoom_status", "cancelled")
    .order("session_date", { ascending: true });
  const tutors = new Map<string, {
    rosterNumber: string | null; name: string; university: string; photoUrl: string | null;
    exam: string; score: string; subjects: Set<string>; nextSession: string | null;
  }>();
  for (const session of sessions ?? []) {
    if (!session.tutor_registry_id) continue;
    const tutor = Array.isArray(session.tutors) ? session.tutors[0] : session.tutors;
    const current = tutors.get(session.tutor_registry_id) || {
      rosterNumber: tutor?.roster_number || null,
      name: tutor?.name || "담당 튜터",
      university: tutor?.university || "선배 검증 튜터",
      photoUrl: tutor?.photo_url || null,
      exam: tutor?.exam || "",
      score: tutor?.score || "",
      subjects: new Set<string>(),
      nextSession: null,
    };
    current.subjects.add(session.subject);
    const sessionTime = new Date(`${session.session_date}T${session.starts_at}`);
    if (!current.nextSession && sessionTime.getTime() >= Date.now()) current.nextSession = sessionTime.toISOString();
    tutors.set(session.tutor_registry_id, current);
  }
  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.heading}><p>MY TUTORS</p><h1><PortalText ko="내 튜터" en="My tutors" /></h1><span><PortalText ko="이번 학기에 함께하는 튜터와 담당 과목을 확인합니다." en="See the tutors and subjects assigned to you this term." /></span></header>
        <div className={styles.grid}>
          {tutors.size ? [...tutors.entries()].map(([registryId, tutor]) => (
            <article key={registryId}>
              <header>
                {tutor.photoUrl ? <img src={tutor.photoUrl} alt={tutor.name} /> : <span>{initials(tutor.name)}</span>}
                <div><small>{tutor.rosterNumber || <PortalText ko="명부 번호 준비 중" en="Roster number pending" />}</small><h2>{tutor.name}</h2><p>{tutor.university}</p></div>
              </header>
              <dl><div><dt><PortalText ko="담당 과목" en="Subjects" /></dt><dd>{[...tutor.subjects].join(" · ")}</dd></div>{tutor.exam && tutor.score && <div><dt><PortalText ko="과목 성적" en="Subject result" /></dt><dd>{tutor.exam} · {tutor.score}</dd></div>}<div><dt><PortalText ko="다음 수업" en="Next lesson" /></dt><dd>{tutor.nextSession ? <PortalDateTime value={tutor.nextSession} /> : <PortalText ko="일정 조율 중" en="Scheduling in progress" />}</dd></div></dl>
            </article>
          )) : <div className={styles.empty}><b><PortalText ko="아직 배정된 튜터가 없습니다." en="No tutor has been assigned yet." /></b><span><PortalText ko="매칭이 완료되면 튜터 프로필이 이곳에 표시됩니다." en="Tutor profiles will appear here once matching is complete." /></span></div>}
        </div>
      </section>
    </main>
  );
}

function initials(value: string) { const clean = value.trim(); return /^[가-힣]/.test(clean) ? clean.slice(-2) : clean.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase(); }
