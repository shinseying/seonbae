-- Drop the tutor credential verification feature.
--
-- The tutor-facing upload page was removed earlier, which left
-- /api/tutor-credentials with no caller, and the admin review queue that read
-- this table has now been removed too. The table never held a row and the
-- bucket never held an object, so nothing is lost.
--
-- Verified before writing this migration: no foreign key references
-- public.tutor_credentials, storage.objects has no policy naming the bucket,
-- and both the table and the bucket are empty.
--
-- The 'tutor-credentials' storage bucket is NOT dropped here. Supabase guards
-- storage.buckets and storage.objects with a storage.protect_delete() trigger,
-- so deleting a bucket in SQL fails with 42501 and rolls back the whole
-- migration. Remove the bucket through the Storage API instead:
--   Dashboard -> Storage -> tutor-credentials -> Delete bucket
-- It is empty and unreferenced, so leaving it costs nothing if that step is
-- skipped.

drop table if exists public.tutor_credentials;
