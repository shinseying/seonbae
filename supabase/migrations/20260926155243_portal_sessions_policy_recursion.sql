-- Every lesson insert failed with 42P17 "infinite recursion detected in policy
-- for relation portal_sessions", for admins and tutors alike (QA-20260921-1).
--
-- Inserting into portal_sessions evaluates the tutor insert policy, which read
-- public.profiles and public.portal_sessions directly. The profiles read policy
-- reads public.portal_sessions again, so the planner met portal_sessions inside
-- its own policy expansion and refused the statement. portal_sessions has held
-- no rows since the loop formed.
--
-- The direct reads move into SECURITY DEFINER helpers in the private schema,
-- like private.current_tutor_registry_id, so no policy reaches back into
-- portal_sessions under RLS. Who may do what is unchanged.

create or replace function private.tutor_has_session_with(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.portal_sessions s
    where s.user_id = target_student_id
      and s.tutor_registry_id = (select private.current_tutor_registry_id())
  );
$function$;

create or replace function private.tutor_has_thread_with(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.chat_threads t
    where t.student_id = target_student_id
      and t.tutor_registry_id = (select private.current_tutor_registry_id())
  );
$function$;

revoke all on function private.tutor_has_session_with(uuid) from public, anon;
revoke all on function private.tutor_has_thread_with(uuid) from public, anon;
grant execute on function private.tutor_has_session_with(uuid) to authenticated;
grant execute on function private.tutor_has_thread_with(uuid) to authenticated;

-- Was: tutor_registry_id = (select tutor_registry_id from profiles where id =
-- auth.uid()) and (a chat thread or an earlier session with this student).
alter policy "Tutors can create their own sessions" on public.portal_sessions
  with check (
    tutor_registry_id = (select private.current_tutor_registry_id())
    and (
      (select private.tutor_has_thread_with(user_id))
      or (select private.tutor_has_session_with(user_id))
    )
  );

alter policy "Authorized users can read profiles" on public.profiles
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or id in (select private.classroom_student_ids())
    or (
      (select private.current_profile_role()) = 'tutor'
      and (select private.tutor_has_session_with(profiles.id))
    )
  );
