-- Classroom membership replaced parent linking. Parents reach their student's
-- sessions, homework, and profile by belonging to the classroom, so the three
-- policies that consulted parent_student_links are rewritten and the table is
-- dropped. It held no rows, so nothing was migrated.
create or replace function public.classroom_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.student_id
  from public.classroom_members m
  join public.classrooms c on c.id = m.classroom_id
  where m.user_id = (select auth.uid())
    and m.status = 'approved';
$$;

revoke all on function public.classroom_student_ids() from public, anon;
grant execute on function public.classroom_student_ids() to authenticated;

drop policy if exists "Authorized users can read profiles" on public.profiles;
create policy "Authorized users can read profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select private.is_admin())
  or id in (select public.classroom_student_ids())
  or (
    (select private.current_profile_role()) = 'tutor'
    and exists (
      select 1 from public.portal_sessions
      where portal_sessions.user_id = profiles.id
        and portal_sessions.tutor_registry_id = (select private.current_tutor_registry_id())
    )
  )
);

drop policy if exists "Authorized users can read homework" on public.portal_assignments;
create policy "Authorized users can read homework"
on public.portal_assignments for select to authenticated
using (
  student_id = (select auth.uid())
  or tutor_registry_id = (select private.current_tutor_registry_id())
  or student_id in (select public.classroom_student_ids())
  or (select private.is_admin())
);

drop policy if exists "Authorized users can read sessions" on public.portal_sessions;
create policy "Authorized users can read sessions"
on public.portal_sessions for select to authenticated
using (
  user_id = (select auth.uid())
  or tutor_registry_id = (select private.current_tutor_registry_id())
  or user_id in (select public.classroom_student_ids())
  or (select private.is_admin())
);

drop table if exists public.parent_student_links;

notify pgrst, 'reload schema';
