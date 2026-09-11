-- Keep relational registry IDs stable while giving every old and new card the
-- same short, human-facing roster-number format.
alter table public.tutors
  add column if not exists roster_index bigint generated always as identity,
  add column if not exists photo_path text;

alter table public.tutors
  add column if not exists roster_number text
  generated always as ('T-' || lpad(roster_index::text, 4, '0')) stored;

create unique index if not exists tutors_roster_number_unique_idx
  on public.tutors (roster_number);

-- Older cards used exam + score. Populate their structured score list once so
-- the redundant representative-score field can disappear from every editor.
update public.tutors
set subject_scores = jsonb_build_array(
  jsonb_build_object('subject', trim(exam), 'score', trim(score))
)
where (
    subject_scores is null
    or jsonb_typeof(subject_scores) <> 'array'
    or subject_scores = '[]'::jsonb
  )
  and nullif(trim(exam), '') is not null
  and nullif(trim(score), '') is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tutor-profile-photos',
  'tutor-profile-photos',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
