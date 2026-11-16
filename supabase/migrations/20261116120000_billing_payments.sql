-- Parent lesson payments through KG Inicis INIPay Pro (일반결제).
--
-- The request route computes the month's amount on the server and writes a
-- pending row; the browser opens the INIPay Pro window with that order id.
-- INIPay posts the auth result back to the return route, which claims the row
-- (pending -> approving), calls the approval API, and records paid or failed.
-- A paid row whose write fails is net-cancelled, so a charge never exists
-- without a row. A net cancel that INIPay refuses leaves 'unreconciled': the
-- card was charged and an operator must refund it from the merchant console.

create table if not exists public.billing_payments (
  id bigint generated always as identity primary key,
  order_id text not null unique check (char_length(order_id) <= 40),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  billing_month text not null check (billing_month ~ '^\d{4}-\d{2}$'),
  amount_krw integer not null check (amount_krw > 0),
  session_ids bigint[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'approving', 'paid', 'failed', 'unreconciled')),
  pay_type text,
  approval_tid text,
  approved_at timestamptz,
  result_code text,
  result_message text check (result_message is null or char_length(result_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One settled payment per parent and month.
create unique index if not exists billing_payments_one_paid_per_month
  on public.billing_payments (parent_id, billing_month)
  where status = 'paid';

create index if not exists billing_payments_parent_id_idx
  on public.billing_payments (parent_id);

-- Read and written only by server routes with the service role.
alter table public.billing_payments enable row level security;
revoke all on table public.billing_payments from anon, authenticated;
create policy "No client access"
  on public.billing_payments
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
