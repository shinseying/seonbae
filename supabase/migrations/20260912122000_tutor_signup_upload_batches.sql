-- Track anonymous tutor-signup uploads until they either become application
-- documents or every issued signed-upload URL has expired. The table lives in
-- a non-exposed schema; only narrowly scoped service-role RPCs can touch it.

create schema if not exists private;

create table private.tutor_signup_upload_batches (
  batch_id uuid primary key,
  email text not null check (char_length(email) between 3 and 320 and email = lower(email)),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  documents jsonb not null check (
    jsonb_typeof(documents) = 'array'
    and jsonb_array_length(documents) between 2 and 9
  ),
  ticket_expires_at timestamptz not null,
  signed_uploads_expire_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'finalizing', 'completed', 'cleaning', 'cancelled')),
  finalization_token uuid,
  finalization_started_at timestamptz,
  user_id uuid,
  cleanup_token uuid,
  cleanup_started_at timestamptz,
  cleanup_delete_user boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tutor_signup_upload_batches_expiry check (
    ticket_expires_at > created_at
    and signed_uploads_expire_at > ticket_expires_at
  ),
  constraint tutor_signup_upload_batches_state check (
    (
      status = 'pending'
      and finalization_token is null
      and finalization_started_at is null
      and user_id is null
      and cleanup_token is null
      and cleanup_started_at is null
      and cleanup_delete_user is null
    )
    or (
      status = 'finalizing'
      and finalization_token is not null
      and finalization_started_at is not null
      and cleanup_token is null
      and cleanup_started_at is null
      and cleanup_delete_user is null
    )
    or (
      status = 'completed'
      and finalization_token is null
      and finalization_started_at is null
      and user_id is not null
      and cleanup_token is null
      and cleanup_started_at is null
      and cleanup_delete_user is null
    )
    or (
      status = 'cleaning'
      and finalization_token is null
      and finalization_started_at is null
      and cleanup_token is not null
      and cleanup_started_at is not null
      and cleanup_delete_user is not null
    )
    or (
      status = 'cancelled'
      and finalization_token is null
      and finalization_started_at is null
      and cleanup_token is null
      and cleanup_started_at is null
      and cleanup_delete_user is null
    )
  )
);

create index tutor_signup_upload_batches_cleanup_idx
  on private.tutor_signup_upload_batches (
    status,
    signed_uploads_expire_at,
    cleanup_started_at
  );

alter table private.tutor_signup_upload_batches enable row level security;
revoke all on table private.tutor_signup_upload_batches
  from public, anon, authenticated, service_role;

create or replace function public.register_tutor_signup_upload_batch(
  p_batch_id uuid,
  p_email text,
  p_phone text,
  p_documents jsonb,
  p_ticket_expires_at timestamptz,
  p_signed_uploads_expire_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_count integer;
  v_credential_count integer;
  v_document_count integer;
  v_distinct_path_count integer;
begin
  if p_batch_id is null
    or p_email is null
    or p_email <> lower(p_email)
    or char_length(p_email) not between 3 and 320
    or p_phone is null
    or p_phone !~ '^\+[1-9][0-9]{7,14}$'
    or p_ticket_expires_at <= now()
    or p_ticket_expires_at > now() + interval '2 hours'
    or p_signed_uploads_expire_at <= p_ticket_expires_at
    or p_signed_uploads_expire_at > now() + interval '3 hours'
    or p_documents is null
    or jsonb_typeof(p_documents) <> 'array'
  then
    return false;
  end if;

  v_document_count := jsonb_array_length(p_documents);
  if v_document_count not between 2 and 9 then return false; end if;

  select
    count(*) filter (where document ->> 'kind' = 'school_proof'),
    count(*) filter (where document ->> 'kind' = 'credential'),
    count(distinct document ->> 'storagePath')
  into v_school_count, v_credential_count, v_distinct_path_count
  from jsonb_array_elements(p_documents) as document;

  if v_school_count <> 1
    or v_credential_count not between 1 and 8
    or v_school_count + v_credential_count <> v_document_count
    or v_distinct_path_count <> v_document_count
    or exists (
      select 1
      from jsonb_array_elements(p_documents) as document
      where jsonb_typeof(document) <> 'object'
        or coalesce(document ->> 'kind', '') not in ('school_proof', 'credential')
        or char_length(coalesce(document ->> 'originalName', '')) not between 1 and 180
        or coalesce(document ->> 'mimeType', '') not in ('application/pdf', 'image/jpeg', 'image/png')
        or coalesce(document ->> 'sizeBytes', '') !~ '^[1-9][0-9]{0,7}$'
        or (document ->> 'sizeBytes')::bigint not between 1 and 10485760
        or char_length(coalesce(document ->> 'storagePath', '')) not between 1 and 500
        or document ->> 'storagePath' not like
          'tutor-signup-documents/' || p_batch_id::text || '/%'
    )
  then
    return false;
  end if;

  insert into private.tutor_signup_upload_batches (
    batch_id,
    email,
    phone,
    documents,
    ticket_expires_at,
    signed_uploads_expire_at
  ) values (
    p_batch_id,
    p_email,
    p_phone,
    p_documents,
    p_ticket_expires_at,
    p_signed_uploads_expire_at
  );
  return true;
exception
  when unique_violation or check_violation then
    return false;
end;
$$;

create or replace function public.claim_tutor_signup_upload_batch(
  p_batch_id uuid,
  p_email text,
  p_phone text,
  p_documents jsonb,
  p_finalization_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  if p_finalization_token is null then return false; end if;

  update private.tutor_signup_upload_batches as batch
  set
    status = 'finalizing',
    finalization_token = p_finalization_token,
    finalization_started_at = now(),
    updated_at = now()
  where batch.batch_id = p_batch_id
    and batch.email = p_email
    and batch.phone = p_phone
    and batch.documents = p_documents
    and batch.status = 'pending'
    and batch.ticket_expires_at > now()
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.attach_tutor_signup_upload_user(
  p_batch_id uuid,
  p_finalization_token uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated boolean;
begin
  if p_finalization_token is null or p_user_id is null then return false; end if;

  update private.tutor_signup_upload_batches as batch
  set user_id = p_user_id, updated_at = now()
  where batch.batch_id = p_batch_id
    and batch.status = 'finalizing'
    and batch.finalization_token = p_finalization_token
    and batch.user_id is null
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

create or replace function public.cancel_tutor_signup_upload_batch(
  p_batch_id uuid,
  p_email text,
  p_phone text,
  p_documents jsonb,
  p_cleanup_token uuid
)
returns table (
  tracked_batch_id uuid,
  tracked_documents jsonb,
  tracked_user_id uuid,
  signed_uploads_expire_at timestamptz,
  tracked_delete_user boolean
)
language sql
security definer
set search_path = ''
as $$
  update private.tutor_signup_upload_batches as batch
  set
    status = 'cleaning',
    cleanup_token = p_cleanup_token,
    cleanup_started_at = now(),
    cleanup_delete_user = true,
    updated_at = now()
  where p_cleanup_token is not null
    and batch.batch_id = p_batch_id
    and batch.email = p_email
    and batch.phone = p_phone
    and batch.documents = p_documents
    and batch.status in ('pending', 'cancelled')
  returning batch.batch_id, batch.documents, batch.user_id,
    batch.signed_uploads_expire_at, batch.cleanup_delete_user;
$$;

create or replace function public.fail_tutor_signup_upload_batch(
  p_batch_id uuid,
  p_finalization_token uuid,
  p_cleanup_token uuid
)
returns table (
  tracked_batch_id uuid,
  tracked_documents jsonb,
  tracked_user_id uuid,
  signed_uploads_expire_at timestamptz,
  tracked_delete_user boolean
)
language sql
security definer
set search_path = ''
as $$
  update private.tutor_signup_upload_batches as batch
  set
    status = 'cleaning',
    finalization_token = null,
    finalization_started_at = null,
    cleanup_token = p_cleanup_token,
    cleanup_started_at = now(),
    cleanup_delete_user = true,
    updated_at = now()
  where p_finalization_token is not null
    and p_cleanup_token is not null
    and batch.batch_id = p_batch_id
    and batch.status = 'finalizing'
    and batch.finalization_token = p_finalization_token
  returning batch.batch_id, batch.documents, batch.user_id,
    batch.signed_uploads_expire_at, batch.cleanup_delete_user;
$$;

create or replace function public.ack_tutor_signup_upload_cleanup(
  p_batch_id uuid,
  p_cleanup_token uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signed_expiry timestamptz;
begin
  select batch.signed_uploads_expire_at
  into v_signed_expiry
  from private.tutor_signup_upload_batches as batch
  where batch.batch_id = p_batch_id
    and batch.status = 'cleaning'
    and batch.cleanup_token = p_cleanup_token
  for update;

  if v_signed_expiry is null then return 'missing'; end if;

  if v_signed_expiry <= now() then
    delete from private.tutor_signup_upload_batches as batch
    where batch.batch_id = p_batch_id
      and batch.status = 'cleaning'
      and batch.cleanup_token = p_cleanup_token;
    return 'deleted';
  end if;

  update private.tutor_signup_upload_batches as batch
  set
    status = 'cancelled',
    cleanup_token = null,
    cleanup_started_at = null,
    cleanup_delete_user = null,
    updated_at = now()
  where batch.batch_id = p_batch_id
    and batch.status = 'cleaning'
    and batch.cleanup_token = p_cleanup_token;
  return 'deferred';
end;
$$;

create or replace function public.complete_tutor_signup_upload_batch(
  p_batch_id uuid,
  p_finalization_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed boolean;
begin
  -- Retain the exact occupied paths until every signed-upload URL is dead.
  -- If an admin deletes the application during that window, the expiry sweep
  -- can still remove an object recreated with the old token.
  update private.tutor_signup_upload_batches as batch
  set
    status = 'completed',
    finalization_token = null,
    finalization_started_at = null,
    cleanup_delete_user = null,
    updated_at = now()
  where batch.batch_id = p_batch_id
    and batch.status = 'finalizing'
    and batch.finalization_token = p_finalization_token
    and batch.user_id is not null
    and not exists (
      select 1
      from jsonb_array_elements(batch.documents) as document
      where not exists (
        select 1
        from public.account_creation_requests as request
        join public.account_request_documents as stored
          on stored.request_id = request.id
        where request.user_id = batch.user_id
          and stored.storage_path = document ->> 'storagePath'
      )
    )
  returning true into v_completed;
  return coalesce(v_completed, false);
end;
$$;

create or replace function public.claim_expired_tutor_signup_upload_batches(
  p_cleanup_token uuid,
  p_limit integer default 20
)
returns table (
  tracked_batch_id uuid,
  tracked_documents jsonb,
  tracked_user_id uuid,
  signed_uploads_expire_at timestamptz,
  tracked_delete_user boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_cleanup_token is null then return; end if;

  -- Never infer failure from a finalizing timeout: the application commit may
  -- be ambiguous. Only fail_tutor_signup_upload_batch may clean that state.
  return query
  with candidates as (
    select
      batch.batch_id,
      case
        when batch.status = 'cleaning' then batch.cleanup_delete_user
        else batch.status <> 'completed'
      end as delete_user
    from private.tutor_signup_upload_batches as batch
    where (
      (
        batch.status in ('pending', 'cancelled')
        and batch.signed_uploads_expire_at <= now()
      )
      or (
        batch.status = 'completed'
        and batch.signed_uploads_expire_at <= now()
      )
      or (
        batch.status = 'cleaning'
        and batch.cleanup_started_at <= now() - interval '10 minutes'
      )
    )
    order by coalesce(batch.cleanup_started_at, batch.signed_uploads_expire_at), batch.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ), claimed as (
    update private.tutor_signup_upload_batches as batch
    set
      status = 'cleaning',
      finalization_token = null,
      finalization_started_at = null,
      cleanup_token = p_cleanup_token,
      cleanup_started_at = now(),
      cleanup_delete_user = candidates.delete_user,
      updated_at = now()
    from candidates
    where batch.batch_id = candidates.batch_id
    returning batch.batch_id, batch.documents, batch.user_id,
      batch.signed_uploads_expire_at, batch.cleanup_delete_user
  )
  select claimed.batch_id, claimed.documents, claimed.user_id,
    claimed.signed_uploads_expire_at, claimed.cleanup_delete_user
  from claimed;
end;
$$;

revoke all on function public.register_tutor_signup_upload_batch(uuid, text, text, jsonb, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_tutor_signup_upload_batch(uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.attach_tutor_signup_upload_user(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_tutor_signup_upload_batch(uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_tutor_signup_upload_batch(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.ack_tutor_signup_upload_cleanup(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_tutor_signup_upload_batch(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_expired_tutor_signup_upload_batches(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.register_tutor_signup_upload_batch(uuid, text, text, jsonb, timestamptz, timestamptz)
  to service_role;
grant execute on function public.claim_tutor_signup_upload_batch(uuid, text, text, jsonb, uuid)
  to service_role;
grant execute on function public.attach_tutor_signup_upload_user(uuid, uuid, uuid)
  to service_role;
grant execute on function public.cancel_tutor_signup_upload_batch(uuid, text, text, jsonb, uuid)
  to service_role;
grant execute on function public.fail_tutor_signup_upload_batch(uuid, uuid, uuid)
  to service_role;
grant execute on function public.ack_tutor_signup_upload_cleanup(uuid, uuid)
  to service_role;
grant execute on function public.complete_tutor_signup_upload_batch(uuid, uuid)
  to service_role;
grant execute on function public.claim_expired_tutor_signup_upload_batches(uuid, integer)
  to service_role;

notify pgrst, 'reload schema';
