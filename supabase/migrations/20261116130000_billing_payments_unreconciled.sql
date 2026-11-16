-- A net cancel that INIPay refuses leaves 'unreconciled': the card was charged
-- and an operator must refund it from the merchant console.
alter table public.billing_payments
  drop constraint billing_payments_status_check,
  add constraint billing_payments_status_check
    check (status in ('pending', 'approving', 'paid', 'failed', 'unreconciled'));
