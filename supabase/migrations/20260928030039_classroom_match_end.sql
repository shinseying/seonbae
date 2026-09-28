-- Ending a tutor-student match (operator decisions E1-E3, 2026-09-28).
--
-- The student or a parent in the room, or the tutor, files an end request with
-- an optional reason; the admin approves it, or ends a match directly. Ending
-- cancels the pair's future lessons (the route deletes their Zoom meetings),
-- and archives the classroom instead of deleting it: ended_at is set, the
-- tutor loses the room and gets the slot back, and the student and parents
-- keep a read-only archive with a ZIP download for 7 days. After purge_after
-- the daily cron deletes the room, the pair's lessons and homework from before
-- the end, and the homework files.

alter table public.classrooms
  add column if not exists ended_at timestamptz,
  add column if not exists purge_after timestamptz,
  add column if not exists ended_by uuid references public.profiles(id) on delete set null,
  add column if not exists end_reason text check (end_reason is null or char_length(end_reason) <= 1000);

create index if not exists classrooms_purge_after_idx
  on public.classrooms (purge_after)
  where purge_after is not null;

create table if not exists public.classroom_end_requests (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references public.classrooms(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  requester_role text not null check (requester_role in ('student', 'parent', 'tutor')),
  reason text check (reason is null or char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open request per classroom; a second one would only duplicate it.
create unique index if not exists classroom_end_requests_one_pending
  on public.classroom_end_requests (classroom_id)
  where status = 'pending';

create index if not exists classroom_end_requests_requested_by_idx
  on public.classroom_end_requests (requested_by);
create index if not exists classroom_end_requests_reviewed_by_idx
  on public.classroom_end_requests (reviewed_by);
create index if not exists classrooms_ended_by_idx
  on public.classrooms (ended_by);

-- Read and written only by server routes with the service role.
alter table public.classroom_end_requests enable row level security;
revoke all on table public.classroom_end_requests from anon, authenticated;
create policy "No client access"
  on public.classroom_end_requests
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- An archived room no longer counts toward the tutor's cap.
create or replace function private.enforce_classroom_limit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  room_limit integer;
  room_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('classroom_limit:' || new.tutor_registry_id, 0));

  select coalesce(t.classroom_limit, 3)
    into room_limit
    from public.tutors t
   where t.registry_id = new.tutor_registry_id;
  room_limit := coalesce(room_limit, 3);

  select count(*)
    into room_count
    from public.classrooms c
   where c.tutor_registry_id = new.tutor_registry_id
     and c.ended_at is null;

  if room_count >= room_limit then
    raise exception 'classroom_limit_reached'
      using errcode = 'check_violation',
            detail = format('limit=%s', room_limit);
  end if;

  return new;
end;
$function$;

-- The tutor's link to a student is an active seat. An ended match no longer
-- lets the tutor open lessons or assign homework for that student.
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
      and c.ended_at is null
  );
$function$;

-- Earlier lessons no longer count as a link on their own: they outlive an
-- ended match. The admin keeps scheduling any pair.
alter policy "Tutors can create their own sessions" on public.portal_sessions
  with check (
    tutor_registry_id = (select private.current_tutor_registry_id())
    and (select private.tutor_has_classroom_with(user_id))
  );

alter policy "Tutors and admins can assign homework" on public.portal_assignments
  with check (
    (select private.is_admin())
    or (
      tutor_registry_id = (select private.current_tutor_registry_id())
      and (select private.tutor_has_classroom_with(student_id))
    )
  );

-- Unchanged except that an archived room cannot take a new student or parent.
create or replace function public.decide_tutor_booking(p_booking_id bigint, p_tutor_registry_id text, p_decision text, p_classroom_id bigint, p_decided_by uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  if not found
     or target_classroom.tutor_registry_id <> p_tutor_registry_id
     or target_classroom.ended_at is not null then
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
$function$;
