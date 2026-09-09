-- Parent membership is the only delegated classroom access. A student belongs
-- through classrooms.student_id and must never inherit another student's data.
create or replace function public.can_view_classroom(target_classroom_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

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
    and m.role = 'parent'
    and m.status = 'approved'
    and c.student_id is not null;
$$;

-- Existing legacy rows remain readable to administrators for cleanup, while
-- every new or changed membership row must be a parent membership.
alter table public.classroom_members
  drop constraint if exists classroom_members_parent_role_only;
alter table public.classroom_members
  add constraint classroom_members_parent_role_only
  check (role = 'parent') not valid;

-- Rate at scheduling time is the billing source of truth for new lessons.
alter table public.portal_sessions
  add column if not exists billing_rate_krw integer
    check (billing_rate_krw is null or billing_rate_krw >= 0);

-- Decide a forwarded booking and assign its classroom in one transaction.
-- Only the service role can execute this function; the route authenticates the
-- caller and the function verifies that identity again before locking rows.
create or replace function public.decide_tutor_booking(
  p_booking_id bigint,
  p_tutor_registry_id text,
  p_decision text,
  p_classroom_id bigint,
  p_decided_by uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_booking public.booking_requests%rowtype;
  target_classroom public.classrooms%rowtype;
  requester_role text;
  requester_status text;
begin
  if p_decision not in ('accepted', 'declined') then
    raise exception using message = 'BOOKING_DECISION_INVALID', errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_decided_by
      and p.role = 'tutor'
      and p.account_status = 'approved'
      and p.tutor_registry_id = p_tutor_registry_id
  ) then
    raise exception using message = 'BOOKING_FORBIDDEN', errcode = 'P0001';
  end if;

  select * into target_booking
  from public.booking_requests
  where id = p_booking_id
  for update;

  if not found or target_booking.tutor_registry_id <> p_tutor_registry_id then
    raise exception using message = 'BOOKING_FORBIDDEN', errcode = 'P0001';
  end if;
  if target_booking.forwarded_at is null then
    raise exception using message = 'BOOKING_NOT_FORWARDED', errcode = 'P0001';
  end if;
  if target_booking.decided_at is not null
     or target_booking.status in ('accepted', 'declined') then
    raise exception using message = 'BOOKING_ALREADY_DECIDED', errcode = 'P0001';
  end if;

  if p_decision = 'declined' then
    update public.booking_requests
    set status = 'declined', decided_at = now(), seen_by_tutor = true, updated_at = now()
    where id = target_booking.id;
    return 'declined';
  end if;

  if p_classroom_id is null then
    raise exception using message = 'BOOKING_CLASSROOM_REQUIRED', errcode = 'P0001';
  end if;

  select * into target_classroom
  from public.classrooms
  where id = p_classroom_id
  for update;

  if not found or target_classroom.tutor_registry_id <> p_tutor_registry_id then
    raise exception using message = 'BOOKING_CLASSROOM_FORBIDDEN', errcode = 'P0001';
  end if;
  if target_booking.requester_id is null then
    raise exception using message = 'BOOKING_REQUESTER_MISSING', errcode = 'P0001';
  end if;

  select role, account_status into requester_role, requester_status
  from public.profiles
  where id = target_booking.requester_id;

  if requester_status <> 'approved' then
    raise exception using message = 'BOOKING_REQUESTER_UNAVAILABLE', errcode = 'P0001';
  end if;

  if requester_role = 'student' then
    if target_classroom.student_id is not null
       and target_classroom.student_id <> target_booking.requester_id then
      raise exception using message = 'BOOKING_CLASSROOM_OCCUPIED', errcode = 'P0001';
    end if;
    update public.classrooms
    set student_id = target_booking.requester_id, updated_at = now()
    where id = target_classroom.id;
  elsif requester_role = 'parent' then
    insert into public.classroom_members (
      classroom_id, user_id, role, status, requested_at, decided_at, decided_by
    ) values (
      target_classroom.id, target_booking.requester_id, 'parent', 'approved', now(), now(), p_decided_by
    )
    on conflict (classroom_id, user_id) do update
    set role = 'parent', status = 'approved', decided_at = now(), decided_by = p_decided_by;
  else
    raise exception using message = 'BOOKING_REQUESTER_UNAVAILABLE', errcode = 'P0001';
  end if;

  update public.booking_requests
  set status = 'accepted', decided_at = now(), classroom_id = target_classroom.id,
      seen_by_tutor = true, updated_at = now()
  where id = target_booking.id;

  return 'accepted';
end;
$$;

revoke all on function public.decide_tutor_booking(bigint, text, text, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.decide_tutor_booking(bigint, text, text, bigint, uuid)
  to service_role;

notify pgrst, 'reload schema';
