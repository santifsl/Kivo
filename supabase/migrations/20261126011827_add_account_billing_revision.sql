-- Compare-and-swap version for Clerk billing reconciliation, including unchanged plans.
alter table public.accounts
  add column billing_revision integer not null default 0;

-- Keep owner reads of the existing contract and reserve the revision for the service role.
revoke select on table public.accounts from authenticated;
grant select (clerk_user_id, plan, created_at) on table public.accounts to authenticated;
