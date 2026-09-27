-- Operator decisions of 2026-09-28 (QA-20260921-1, D5 and chat removal).
--
-- D5. A tutor accepts a match and the student takes a seat in one of the
-- tutor's classrooms (public.decide_tutor_booking). That seat now makes the
-- student the tutor's student, so the tutor can open lessons, assign homework
-- and see the student's profile without the admin scheduling a first lesson.
-- Before, only an earlier lesson or a chat thread counted, and only an admin
-- lesson created either. The chat-thread route is dropped with chat itself.
--
-- Chat. Student-tutor chat is switched off. The app route refuses, and here
-- signed-in users lose direct table access to chat_messages, which RLS would
-- otherwise still allow through the REST API. Rows are kept; restoring the
-- grants below turns it back on.

create or replace function private.tutor_has_classroom_with(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.classrooms c
    where c.student_id = target_student_id
      and c.tutor_registry_id = (select private.current_tutor_registry_id())
  );
$function$;

revoke all on function private.tutor_has_classroom_with(uuid) from public, anon;
grant execute on function private.tutor_has_classroom_with(uuid) to authenticated;

alter policy "Tutors can create their own sessions" on public.portal_sessions
  with check (
    tutor_registry_id = (select private.current_tutor_registry_id())
    and (
      (select private.tutor_has_classroom_with(user_id))
      or (select private.tutor_has_session_with(user_id))
    )
  );

alter policy "Tutors and admins can assign homework" on public.portal_assignments
  with check (
    (select private.is_admin())
    or (
      tutor_registry_id = (select private.current_tutor_registry_id())
      and (
        (select private.tutor_has_classroom_with(student_id))
        or (select private.tutor_has_session_with(student_id))
      )
    )
  );

alter policy "Authorized users can read profiles" on public.profiles
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or id in (select private.classroom_student_ids())
    or (
      (select private.current_profile_role()) = 'tutor'
      and (
        (select private.tutor_has_session_with(profiles.id))
        or (select private.tutor_has_classroom_with(profiles.id))
      )
    )
  );

revoke insert, select, update on table public.chat_messages from authenticated;
