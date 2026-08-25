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

drop table if exists public.tutor_credentials;

delete from storage.objects where bucket_id = 'tutor-credentials';
delete from storage.buckets where id = 'tutor-credentials';
