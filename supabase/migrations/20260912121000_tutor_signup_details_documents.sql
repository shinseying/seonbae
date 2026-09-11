-- Restore structured tutor-application details to account signup and allow
-- several private credential files without overloading the school-proof slot.

alter table public.account_creation_requests
  add column if not exists major_year text;

alter table public.account_creation_requests
  drop constraint if exists account_creation_requests_major_year_length;

alter table public.account_creation_requests
  add constraint account_creation_requests_major_year_length
  check (major_year is null or char_length(major_year) <= 120);

-- Admin tutor details reads every signed contract for one application newest first.
create index if not exists tutor_contract_signatures_application_signed_idx
  on public.tutor_contract_signatures (application_request_id, signed_at desc);

-- Recover the discrete value from applications created by the legacy form.
update public.account_creation_requests
set major_year = nullif(
  left(btrim(split_part(split_part(applicant_note, E'\n', 1), ':', 2)), 120),
  ''
)
where major_year is null
  and applicant_note like '전공/학년:%';

create table if not exists public.account_request_documents (
  request_id bigint not null
    references public.account_creation_requests(id) on delete cascade,
  kind text not null
    check (kind in ('school_proof', 'credential')),
  storage_path text not null
    check (char_length(storage_path) between 1 and 500),
  original_name text not null
    check (char_length(original_name) between 1 and 180),
  mime_type text
    check (mime_type is null or mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint
    check (size_bytes is null or size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  primary key (request_id, storage_path)
);

create index if not exists account_request_documents_request_kind_idx
  on public.account_request_documents (request_id, kind, created_at);

-- Preserve documents submitted before normalized document rows existed.
insert into public.account_request_documents (
  request_id,
  kind,
  storage_path,
  original_name,
  mime_type,
  size_bytes,
  created_at
)
select
  id,
  'school_proof',
  acceptance_letter_path,
  acceptance_letter_name,
  null,
  null,
  created_at
from public.account_creation_requests
where acceptance_letter_path is not null
  and acceptance_letter_name is not null
on conflict (request_id, storage_path) do nothing;

insert into public.account_request_documents (
  request_id,
  kind,
  storage_path,
  original_name,
  mime_type,
  size_bytes,
  created_at
)
select
  id,
  'credential',
  credential_path,
  credential_name,
  null,
  null,
  created_at
from public.account_creation_requests
where credential_path is not null
  and credential_name is not null
on conflict (request_id, storage_path) do nothing;

alter table public.account_request_documents enable row level security;
revoke all on table public.account_request_documents from public, anon, authenticated;
grant select on table public.account_request_documents to authenticated;

create policy "Admins can read account request documents"
on public.account_request_documents
for select
to authenticated
using ((select private.is_admin()));

notify pgrst, 'reload schema';
