-- A tutor can sign the contract before admissions chooses the tutor card.
-- Card ownership is filled during approval rather than being guessed at sign-up.
alter table public.tutor_contract_signatures
  alter column tutor_registry_id drop not null;

-- A tutor card has one owner. The provisioning API also checks this before it
-- links a card, while this index closes the race between concurrent requests.
create unique index if not exists profiles_tutor_registry_unique_idx
  on public.profiles (tutor_registry_id)
  where tutor_registry_id is not null;
