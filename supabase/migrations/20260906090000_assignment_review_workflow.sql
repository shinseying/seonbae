-- Extend the homework record into a complete hand-in and review workflow.
-- Existing rows and the original todo/submitted/graded values remain valid.

alter table public.portal_assignments
  add column if not exists student_attachment_name text,
  add column if not exists student_attachment_path text,
  add column if not exists returned_for_revision_at timestamptz;

alter table public.portal_assignments
  drop constraint if exists portal_assignments_status_check;

alter table public.portal_assignments
  add constraint portal_assignments_status_check
  check (status in ('todo', 'submitted', 'graded', 'needs_revision'));

-- Student work uses the existing private homework bucket. Keep the same 10 MB
-- ceiling while allowing the common Office formats used for classwork.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
where id = 'homework-files';

notify pgrst, 'reload schema';
