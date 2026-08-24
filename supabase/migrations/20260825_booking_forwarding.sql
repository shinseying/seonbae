-- Bookings (matches) now notify the admin first; the admin forwards each one to
-- the tutor from the portal. Track when that hand-off happened.
alter table public.booking_requests
  add column if not exists forwarded_at timestamptz,
  add column if not exists forwarded_by uuid references public.profiles(id) on delete set null;

notify pgrst, 'reload schema';
