-- The tutor application form already collects curriculum, official score, and
-- an introduction, but they were concatenated into applicant_note and never
-- reached the registry. Store them discretely so provisioning can copy them
-- straight onto the public tutor card.
alter table public.account_creation_requests
  add column if not exists curriculum text,
  add column if not exists official_score text,
  add column if not exists introduction text;

notify pgrst, 'reload schema';
