-- 보완 요청 and 반려 used to share one status, `rejected`, and nothing moved an
-- application out of it, so an applicant asked for more documents had no way
-- to send them. `needs_info` is the 보완 요청: the applicant uploads documents
-- from /portal/pending and the application returns to the review queue.
-- `rejected` stays as the final 반려.

alter table public.account_creation_requests
  drop constraint account_creation_requests_status_check,
  add constraint account_creation_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'needs_info'));

alter table public.profiles
  drop constraint profiles_account_status_check,
  add constraint profiles_account_status_check
    check (account_status in ('pending', 'approved', 'rejected', 'needs_info'));

alter table public.account_creation_requests
  add column if not exists resubmitted_at timestamptz,
  add column if not exists resubmission_note text
    check (resubmission_note is null or char_length(resubmission_note) <= 2000);
