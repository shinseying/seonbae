-- Approved tutor profiles created before application-linked provisioning need
-- an application id before they can sign the current electronic contract.

with unique_legacy_match as (
  select
    profile.id as tutor_id,
    min(request.id) as request_id,
    profile.account_reviewed_at
  from public.profiles as profile
  join public.account_creation_requests as request
    on lower(request.email) = lower(profile.email)
   and request.requested_role = 'tutor'
   and request.user_id is null
   and request.status <> 'rejected'
  where profile.role = 'tutor'
    and profile.account_status = 'approved'
    and not exists (
      select 1
      from public.account_creation_requests as linked
      where linked.user_id = profile.id
    )
  group by profile.id, profile.account_reviewed_at
  having count(*) = 1
)
update public.account_creation_requests as request
set
  user_id = matched.tutor_id,
  status = 'approved',
  reviewed_at = coalesce(request.reviewed_at, matched.account_reviewed_at, now()),
  review_note = coalesce(
    nullif(request.review_note, ''),
    '기존 승인 튜터 계정과 자동 연결된 지원 기록입니다.'
  ),
  updated_at = now()
from unique_legacy_match as matched
where request.id = matched.request_id
  and request.user_id is null;

insert into public.account_creation_requests (
  user_id,
  full_name,
  email,
  phone,
  requested_role,
  status,
  reviewed_at,
  review_note
)
select
  profile.id,
  coalesce(nullif(profile.full_name, ''), split_part(profile.email, '@', 1)),
  profile.email,
  coalesce(profile.phone, ''),
  'tutor',
  'approved',
  coalesce(profile.account_reviewed_at, now()),
  '기존 승인 튜터 계정의 계약 연결 복구를 위해 생성된 기록입니다.'
from public.profiles as profile
where profile.role = 'tutor'
  and profile.account_status = 'approved'
  and not exists (
    select 1
    from public.account_creation_requests as linked
    where linked.user_id = profile.id
  )
  -- Do not guess when an unlinked or rejected application exists. The admin
  -- repair endpoint reports those cases for manual review.
  and not exists (
    select 1
    from public.account_creation_requests as possible
    where possible.user_id is null
      and lower(possible.email) = lower(profile.email)
  )
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
