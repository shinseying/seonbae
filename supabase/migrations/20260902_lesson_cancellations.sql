-- Anyone in the classroom can file a cancellation against a scheduled lesson.
-- The columns record who asked and why; the lesson itself is marked cancelled.
alter table public.portal_sessions
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

notify pgrst, 'reload schema';
