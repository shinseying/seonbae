alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
    check (role in ('user', 'parent', 'tutor', 'admin'));

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
  limit 1;
$$;

create or replace function public.current_tutor_registry_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select tutor_registry_id
  from public.profiles
  where id = (select auth.uid())
    and role = 'tutor'
  limit 1;
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.current_tutor_registry_id() from public;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_tutor_registry_id() to authenticated;

drop policy if exists "Tutors can read their assigned sessions"
  on public.portal_sessions;
create policy "Tutors can read their assigned sessions"
on public.portal_sessions
for select
to authenticated
using (
  tutor_registry_id = (select public.current_tutor_registry_id())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_tutor_registry_id text;
  requested_role text;
begin
  select registry_id
  into matched_tutor_registry_id
  from public.tutors
  where zoom_host_email is not null
    and lower(zoom_host_email) = lower(coalesce(new.email, ''))
  limit 1;

  requested_role := case
    when new.raw_user_meta_data ->> 'account_role' = 'parent' then 'parent'
    else 'user'
  end;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    tutor_registry_id
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when matched_tutor_registry_id is not null then 'tutor'
      else requested_role
    end,
    matched_tutor_registry_id
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    role = case
      when public.profiles.role = 'admin' then 'admin'
      when matched_tutor_registry_id is not null then 'tutor'
      when requested_role = 'parent' then 'parent'
      else public.profiles.role
    end,
    tutor_registry_id = coalesce(
      matched_tutor_registry_id,
      public.profiles.tutor_registry_id
    ),
    updated_at = now();

  return new;
end;
$$;

create table if not exists public.parent_student_links (
  parent_id uuid not null
    references public.profiles(id) on delete cascade,
  student_id uuid not null
    references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id),
  constraint parent_student_links_distinct_check
    check (parent_id <> student_id)
);

create index if not exists parent_student_links_student_idx
  on public.parent_student_links (student_id);

alter table public.parent_student_links enable row level security;

revoke all on table public.parent_student_links from public, anon, authenticated;
grant select, insert, update, delete on table public.parent_student_links
  to authenticated;

drop policy if exists "Families can read their links"
  on public.parent_student_links;
create policy "Families can read their links"
on public.parent_student_links
for select
to authenticated
using (
  parent_id = (select auth.uid())
  or student_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists "Admins can manage family links"
  on public.parent_student_links;
create policy "Admins can manage family links"
on public.parent_student_links
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Parents can read linked student profiles"
  on public.profiles;
create policy "Parents can read linked student profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.parent_student_links
    where parent_id = (select auth.uid())
      and student_id = profiles.id
  )
);

drop policy if exists "Tutors can read assigned student profiles"
  on public.profiles;
create policy "Tutors can read assigned student profiles"
on public.profiles
for select
to authenticated
using (
  (select public.current_profile_role()) = 'tutor'
  and exists (
    select 1
    from public.portal_sessions
    where user_id = profiles.id
      and tutor_registry_id = (select public.current_tutor_registry_id())
  )
);

alter table public.portal_sessions
  add column if not exists zoom_started_at timestamptz,
  add column if not exists zoom_ended_at timestamptz,
  add column if not exists actual_minutes integer;

alter table public.portal_sessions
  drop constraint if exists portal_sessions_actual_minutes_check;

alter table public.portal_sessions
  add constraint portal_sessions_actual_minutes_check
    check (actual_minutes is null or actual_minutes between 0 and 1440);

drop policy if exists "Parents can read linked student sessions"
  on public.portal_sessions;
create policy "Parents can read linked student sessions"
on public.portal_sessions
for select
to authenticated
using (
  (select public.current_profile_role()) = 'parent'
  and exists (
    select 1
    from public.parent_student_links
    where parent_id = (select auth.uid())
      and student_id = portal_sessions.user_id
  )
);

create table if not exists public.chat_threads (
  id bigint generated by default as identity primary key,
  student_id uuid not null
    references public.profiles(id) on delete cascade,
  tutor_registry_id text not null
    references public.tutors(registry_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, tutor_registry_id)
);

create index if not exists chat_threads_tutor_idx
  on public.chat_threads (tutor_registry_id, updated_at desc);

alter table public.chat_threads enable row level security;

revoke all on table public.chat_threads from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_threads
  to authenticated;
grant usage, select on sequence public.chat_threads_id_seq to authenticated;

drop policy if exists "Chat participants can read threads"
  on public.chat_threads;
create policy "Chat participants can read threads"
on public.chat_threads
for select
to authenticated
using (
  student_id = (select auth.uid())
  or (
    (select public.current_profile_role()) = 'tutor'
    and tutor_registry_id = (select public.current_tutor_registry_id())
  )
  or (select public.is_admin())
);

drop policy if exists "Admins can manage chat threads"
  on public.chat_threads;
create policy "Admins can manage chat threads"
on public.chat_threads
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

insert into public.chat_threads (student_id, tutor_registry_id)
select distinct user_id, tutor_registry_id
from public.portal_sessions
where tutor_registry_id is not null
on conflict (student_id, tutor_registry_id) do nothing;

create or replace function public.can_access_chat_thread(target_thread_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_threads
    where id = target_thread_id
      and (
        student_id = (select auth.uid())
        or (
          (select public.current_profile_role()) = 'tutor'
          and tutor_registry_id = (select public.current_tutor_registry_id())
        )
        or (select public.is_admin())
      )
  );
$$;

revoke all on function public.can_access_chat_thread(bigint) from public;
grant execute on function public.can_access_chat_thread(bigint)
  to authenticated;

create table if not exists public.chat_messages (
  id bigint generated by default as identity primary key,
  thread_id bigint not null
    references public.chat_threads(id) on delete cascade,
  sender_id uuid not null
    references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint chat_messages_body_check
    check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at);

alter table public.chat_messages enable row level security;

revoke all on table public.chat_messages from public, anon, authenticated;
grant select, insert, update on table public.chat_messages to authenticated;
grant usage, select on sequence public.chat_messages_id_seq to authenticated;

drop policy if exists "Chat participants can read messages"
  on public.chat_messages;
create policy "Chat participants can read messages"
on public.chat_messages
for select
to authenticated
using ((select public.can_access_chat_thread(thread_id)));

drop policy if exists "Chat participants can send messages"
  on public.chat_messages;
create policy "Chat participants can send messages"
on public.chat_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and (select public.can_access_chat_thread(thread_id))
);

drop policy if exists "Recipients can mark messages read"
  on public.chat_messages;
create policy "Recipients can mark messages read"
on public.chat_messages
for update
to authenticated
using (
  sender_id <> (select auth.uid())
  and (select public.can_access_chat_thread(thread_id))
)
with check ((select public.can_access_chat_thread(thread_id)));

create table if not exists public.consultation_sessions (
  id bigint generated by default as identity primary key,
  parent_id uuid not null
    references public.profiles(id) on delete cascade,
  session_date date not null,
  starts_at time not null,
  duration_minutes integer not null default 45
    check (duration_minutes between 15 and 180),
  topic text not null,
  title text not null,
  notes text,
  zoom_meeting_number text,
  zoom_meeting_uuid text,
  zoom_passcode text,
  zoom_host_email text,
  zoom_status text not null default 'unconfigured'
    check (
      zoom_status in (
        'unconfigured',
        'scheduled',
        'live',
        'ended',
        'cancelled'
      )
    ),
  zoom_created_at timestamptz,
  zoom_started_at timestamptz,
  zoom_ended_at timestamptz,
  actual_minutes integer
    check (actual_minutes is null or actual_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists consultation_sessions_zoom_meeting_idx
  on public.consultation_sessions (zoom_meeting_number)
  where zoom_meeting_number is not null;

create index if not exists consultation_sessions_parent_date_idx
  on public.consultation_sessions (parent_id, session_date, starts_at);

alter table public.consultation_sessions enable row level security;

revoke all on table public.consultation_sessions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.consultation_sessions
  to authenticated;
grant usage, select on sequence public.consultation_sessions_id_seq
  to authenticated;

drop policy if exists "Parents can read their consultations"
  on public.consultation_sessions;
create policy "Parents can read their consultations"
on public.consultation_sessions
for select
to authenticated
using (parent_id = (select auth.uid()));

drop policy if exists "Admins can manage consultations"
  on public.consultation_sessions;
create policy "Admins can manage consultations"
on public.consultation_sessions
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create table if not exists public.consultation_attendance (
  id bigint generated by default as identity primary key,
  event_id text not null unique,
  consultation_id bigint not null
    references public.consultation_sessions(id) on delete cascade,
  zoom_participant_id text,
  participant_name text,
  participant_email text,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists consultation_attendance_session_idx
  on public.consultation_attendance (consultation_id, joined_at);

alter table public.consultation_attendance enable row level security;

revoke all on table public.consultation_attendance
  from public, anon, authenticated;
grant select on table public.consultation_attendance to authenticated;

drop policy if exists "Parents can read consultation attendance"
  on public.consultation_attendance;
create policy "Parents can read consultation attendance"
on public.consultation_attendance
for select
to authenticated
using (
  exists (
    select 1
    from public.consultation_sessions
    where consultation_sessions.id = consultation_attendance.consultation_id
      and consultation_sessions.parent_id = (select auth.uid())
  )
);

drop policy if exists "Admins can read consultation attendance"
  on public.consultation_attendance;
create policy "Admins can read consultation attendance"
on public.consultation_attendance
for select
to authenticated
using ((select public.is_admin()));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;

notify pgrst, 'reload schema';
