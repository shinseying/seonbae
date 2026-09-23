-- Security advisor cleanup (QA-20260921-1, F5).
--
-- public.can_view_classroom(bigint) and public.classroom_student_ids() are
-- SECURITY DEFINER RLS helpers. Living in public, PostgREST exposed them as
-- /rest/v1/rpc/* to every signed-in user. Nothing in the app calls them over
-- RPC; only RLS policies do. They move to the private schema, which PostgREST
-- does not expose, beside private.is_admin and private.current_tutor_registry_id.
-- Bodies are unchanged. authenticated keeps EXECUTE because RLS evaluates the
-- policies as the querying user.

create or replace function private.can_view_classroom(target_classroom_id bigint)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.classrooms c
    where c.id = target_classroom_id
      and (
        c.student_id = (select auth.uid())
        or c.tutor_registry_id = (select private.current_tutor_registry_id())
        or exists (
          select 1
          from public.classroom_members m
          where m.classroom_id = c.id
            and m.user_id = (select auth.uid())
            and m.role = 'parent'
            and m.status = 'approved'
        )
        or (select private.is_admin())
      )
  );
$function$;

create or replace function private.classroom_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select c.student_id
  from public.classroom_members m
  join public.classrooms c on c.id = m.classroom_id
  where m.user_id = (select auth.uid())
    and m.role = 'parent'
    and m.status = 'approved'
    and c.student_id is not null;
$function$;

revoke all on function private.can_view_classroom(bigint) from public, anon;
revoke all on function private.classroom_student_ids() from public, anon;
grant execute on function private.can_view_classroom(bigint) to authenticated;
grant execute on function private.classroom_student_ids() to authenticated;

alter policy "Members can read their classroom" on public.classrooms
  using ((select private.can_view_classroom(id)));

alter policy "Members and the tutor can read membership" on public.classroom_members
  using (
    user_id = (select auth.uid())
    or (select private.can_view_classroom(classroom_id))
  );

alter policy "Authorized users can read profiles" on public.profiles
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or id in (select private.classroom_student_ids())
    or (
      (select private.current_profile_role()) = 'tutor'
      and exists (
        select 1
        from public.portal_sessions
        where portal_sessions.user_id = profiles.id
          and portal_sessions.tutor_registry_id = (select private.current_tutor_registry_id())
      )
    )
  );

alter policy "Authorized users can read homework" on public.portal_assignments
  using (
    student_id = (select auth.uid())
    or tutor_registry_id = (select private.current_tutor_registry_id())
    or student_id in (select private.classroom_student_ids())
    or (select private.is_admin())
  );

alter policy "Authorized users can read sessions" on public.portal_sessions
  using (
    user_id = (select auth.uid())
    or tutor_registry_id = (select private.current_tutor_registry_id())
    or user_id in (select private.classroom_student_ids())
    or (select private.is_admin())
  );

drop function public.can_view_classroom(bigint);
drop function public.classroom_student_ids();

-- Upload batches are written and read only by the server with the service
-- role, which bypasses RLS. State that no client role may touch them, rather
-- than relying on the absence of a policy.
create policy "No client access"
  on private.tutor_signup_upload_batches
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
