-- The new unique partial index covers the same lookups while also enforcing
-- one profile per tutor card, so retaining the older index only adds write cost.
drop index if exists public.profiles_tutor_registry_idx;
