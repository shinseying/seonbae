-- Stop handing a tutor card to whoever signs up with a matching email.
--
-- handle_new_user() used to look up public.tutors for a row whose
-- zoom_host_email equalled the new account's email, and if it found one it
-- created the profile as role 'tutor' already linked to that card. Two problems
-- with that: zoom_host_email means "the Zoom account that hosts this tutor's
-- meetings", not "the person who owns this card", and an address that ends up
-- on a card for any reason silently grants tutor access to the next person who
-- registers it. It also overrode the role the person actually asked for at
-- signup.
--
-- Cards are now assigned deliberately by an admin (see
-- /api/admin/tutors/assignment). A new account gets the role it requested and
-- no registry link.
--
-- Everything else in the function is unchanged. The role/tutor_registry_id
-- branches in the conflict path collapsed to "keep what is already there" once
-- the lookup was gone, so they are simply dropped.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  requested_role text;
  initial_status text;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'account_role' in ('student', 'parent', 'tutor')
      then new.raw_user_meta_data ->> 'account_role'
    else 'student'
  end;

  initial_status := case
    when coalesce(new.email, '') = 'ssapgoadmin@seonbae.internal' then 'approved'
    else 'pending'
  end;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    account_status
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    requested_role,
    initial_status
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    updated_at = now();

  -- A consultation booked before the account existed belongs to this person as
  -- soon as they sign up with the same address.
  perform public.claim_consultations_for_user(new.id, new.email);

  return new;
end;
$function$;
