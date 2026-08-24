-- Store the Zoom-provided join_url so the portal can hand off to the desktop
-- Zoom Workspace app instead of embedding the web SDK. The join_url embeds the
-- encrypted passcode, so the link launches straight into the meeting.
alter table public.portal_sessions
  add column if not exists zoom_join_url text;

alter table public.consultation_sessions
  add column if not exists zoom_join_url text;

notify pgrst, 'reload schema';
