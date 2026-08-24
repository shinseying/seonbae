-- Premium/standard tiers are gone: the registry no longer ranks tutors.
alter table public.tutors
  drop column if exists tier;

-- The tutor application now collects a score per subject with its own proof,
-- plus the languages and lesson format the card advertises, so everything the
-- public card shows is answered by the applicant and carries straight over.
alter table public.account_creation_requests
  add column if not exists subject_scores jsonb not null default '[]'::jsonb,
  add column if not exists languages text,
  add column if not exists lesson_format text;

notify pgrst, 'reload schema';
