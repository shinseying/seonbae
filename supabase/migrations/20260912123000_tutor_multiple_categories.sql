-- A tutor who sat the SAT, the IB diploma and two AP papers is one card with
-- three categories, not three cards. `category` stays as the primary one so
-- every existing reader keeps working; `categories` is what the filters and the
-- editor now write.
--
-- Empty is allowed rather than rejected: a writer that predates this column
-- should still be able to insert a row, and every reader falls back to
-- `category` when the array is empty.
alter table public.tutors
  add column if not exists categories text[] not null default '{}'::text[];

update public.tutors
  set categories = array[category]
  where coalesce(array_length(categories, 1), 0) = 0;

alter table public.tutors
  drop constraint if exists tutors_categories_check;

alter table public.tutors
  add constraint tutors_categories_check
  check (
    coalesce(array_length(categories, 1), 0) <= 8
    and categories <@ array['ib', 'ap', 'alevel', 'sat', 'english']::text[]
  );
