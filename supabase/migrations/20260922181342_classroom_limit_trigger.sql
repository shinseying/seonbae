-- The classroom cap was enforced only in the route: it counted the tutor's
-- rooms, then inserted. Four parallel requests all read the same count and all
-- inserted, leaving a tutor with 5 rooms against a cap of 3 (QA-20260921-1, F6).
--
-- The check now runs inside the insert. A per-tutor transaction lock makes
-- concurrent inserts for the same tutor take turns, so each one counts the rows
-- the previous one committed. The route keeps its own pre-check for the friendly
-- message and maps this error (check_violation) to the same 409.

create or replace function private.enforce_classroom_limit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  room_limit integer;
  room_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('classroom_limit:' || new.tutor_registry_id, 0));

  select coalesce(t.classroom_limit, 3)
    into room_limit
    from public.tutors t
   where t.registry_id = new.tutor_registry_id;
  room_limit := coalesce(room_limit, 3);

  select count(*)
    into room_count
    from public.classrooms c
   where c.tutor_registry_id = new.tutor_registry_id;

  if room_count >= room_limit then
    raise exception 'classroom_limit_reached'
      using errcode = 'check_violation',
            detail = format('limit=%s', room_limit);
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_classroom_limit() from public, anon, authenticated;

drop trigger if exists enforce_classroom_limit on public.classrooms;
create trigger enforce_classroom_limit
  before insert on public.classrooms
  for each row execute function private.enforce_classroom_limit();
