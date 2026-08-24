-- Unify parent Zoom consultations (consultation_sessions) into the single
-- consultation_requests table. A row with no zoom_meeting_number is an inbound
-- inquiry (상담 신청); once scheduled it gains Zoom fields and becomes a
-- consultation (상담 일정), leaving the inquiry list automatically.

-- 1. Scheduling + Zoom columns on the surviving table.
alter table public.consultation_requests
  add column if not exists session_date date,
  add column if not exists starts_at time,
  add column if not exists duration_minutes integer,
  add column if not exists meeting_title text,
  add column if not exists notes text,
  add column if not exists zoom_meeting_number text,
  add column if not exists zoom_meeting_uuid text,
  add column if not exists zoom_passcode text,
  add column if not exists zoom_join_url text,
  add column if not exists zoom_host_email text,
  add column if not exists zoom_status text not null default 'unconfigured',
  add column if not exists zoom_created_at timestamptz,
  add column if not exists zoom_started_at timestamptz,
  add column if not exists zoom_ended_at timestamptz,
  add column if not exists actual_minutes integer;

-- Admin-scheduled consultations carry no inquiry fields, so those become optional.
alter table public.consultation_requests
  alter column name drop not null,
  alter column email drop not null,
  alter column curriculum drop not null,
  alter column subject drop not null,
  alter column goals drop not null;

alter table public.consultation_requests
  drop constraint if exists consultation_requests_zoom_status_check;
alter table public.consultation_requests
  add constraint consultation_requests_zoom_status_check
    check (zoom_status in ('unconfigured', 'scheduled', 'live', 'ended', 'cancelled'));

alter table public.consultation_requests
  drop constraint if exists consultation_requests_actual_minutes_check;
alter table public.consultation_requests
  add constraint consultation_requests_actual_minutes_check
    check (actual_minutes is null or actual_minutes between 0 and 1440);

create unique index if not exists consultation_requests_zoom_meeting_idx
  on public.consultation_requests (zoom_meeting_number)
  where zoom_meeting_number is not null;

-- 2. Migrate existing scheduled consultations into the unified table.
insert into public.consultation_requests (
  user_id, name, email, subject, goals,
  session_date, starts_at, duration_minutes, meeting_title, notes,
  zoom_meeting_number, zoom_meeting_uuid, zoom_passcode, zoom_host_email,
  zoom_status, zoom_created_at, zoom_started_at, zoom_ended_at, actual_minutes,
  status, source, language, created_at, updated_at
)
select
  cs.parent_id,
  coalesce(nullif(btrim(p.full_name), ''), '보호자'),
  nullif(p.email, ''),
  cs.topic,
  cs.notes,
  cs.session_date, cs.starts_at, cs.duration_minutes, cs.title, cs.notes,
  cs.zoom_meeting_number, cs.zoom_meeting_uuid, cs.zoom_passcode, cs.zoom_host_email,
  cs.zoom_status, cs.zoom_created_at, cs.zoom_started_at, cs.zoom_ended_at, cs.actual_minutes,
  'contacted', 'website', 'ko', cs.created_at, cs.updated_at
from public.consultation_sessions cs
left join public.profiles p on p.id = cs.parent_id;

-- 3. Drop the now-merged tables. consultation_attendance was write-only
-- telemetry with no UI reader, so it goes with its parent.
drop table if exists public.consultation_attendance;
drop table if exists public.consultation_sessions;

-- 4. The account holder (parent) reads their own scheduled consultations.
drop policy if exists "Users can read their consultations" on public.consultation_requests;
create policy "Users can read their consultations"
on public.consultation_requests
for select
to authenticated
using (user_id = (select auth.uid()));

-- 5. Admins create scheduled consultations with their own cookie session, so
-- the table needs an INSERT grant + admin insert policy (previously only the
-- service-role path inserted here).
grant insert on table public.consultation_requests to authenticated;

drop policy if exists "Admins can insert consultations" on public.consultation_requests;
create policy "Admins can insert consultations"
on public.consultation_requests
for insert
to authenticated
with check ((select private.is_admin()));

notify pgrst, 'reload schema';
