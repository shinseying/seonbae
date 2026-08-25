-- The consultation form now asks which evening slots suit the family.
alter table public.consultation_requests
  add column if not exists preferred_times text;

-- A consultation can be scheduled for someone with no account. When they sign
-- up with the same address the rows are claimed so the portal shows them;
-- handle_new_user calls this on every new account.
create or replace function public.claim_consultations_for_user(target_user_id uuid, target_email text)
returns integer
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.consultation_requests
    set user_id = target_user_id,
        updated_at = now()
    where user_id is null
      and target_email is not null
      and lower(email) = lower(target_email)
    returning 1
  )
  select count(*)::integer from claimed;
$$;

revoke all on function public.claim_consultations_for_user(uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
