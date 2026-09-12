-- IGCSE becomes a category of its own. It was folded into `alevel`, which put
-- an IGCSE-only tutor under the A-Level filter on a card that never said so.
-- The public directory already had a separate IGCSE filter and inferred it from
-- the subject text, so this only makes the stored value agree with it.
--
-- Both constraints move together: the single `category` column predates the
-- array and carries its own allowed list.
alter table public.tutors
  drop constraint if exists tutors_category_check;

alter table public.tutors
  add constraint tutors_category_check
  check (category in ('ib', 'ap', 'alevel', 'igcse', 'sat', 'english'));

alter table public.tutors
  drop constraint if exists tutors_categories_check;

alter table public.tutors
  add constraint tutors_categories_check
  check (
    coalesce(array_length(categories, 1), 0) <= 8
    and categories <@ array['ib', 'ap', 'alevel', 'igcse', 'sat', 'english']::text[]
  );
