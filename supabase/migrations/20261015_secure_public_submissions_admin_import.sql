-- EMRS MeritScope: keep the public score form available, but lock bulk imports to allow-listed admins.
-- Apply AFTER 20261014_admin_merit_import.sql in Supabase project ggumftjadfhofenealxs.
-- This migration changes permissions only; it does not insert, update, or delete candidate data.

alter table public.candidate_submissions enable row level security;

-- Public users may submit only the fields used by the public score form.
-- They cannot set rank/import metadata, update existing records, or delete records.
revoke insert, update, delete on public.candidate_submissions from anon, authenticated;
grant insert (
  candidate_name,
  post_applied,
  category,
  tier1_qualified,
  tier1_category,
  tier2_score,
  relaxation_used,
  score_type
) on public.candidate_submissions to anon, authenticated;

drop policy if exists "Allow candidate submissions" on public.candidate_submissions;
drop policy if exists "Public score form submissions only" on public.candidate_submissions;
create policy "Public score form submissions only"
  on public.candidate_submissions
  for insert
  to anon, authenticated
  with check (
    source = 'public_submission'
    and candidate_rank is null
    and import_key is null
    and import_batch_id is null
  );

-- The bulk-import RPC must never be executable by anonymous users or PUBLIC.
-- The function itself also checks auth.uid() against public.admin_users.
revoke all on function public.admin_import_merit_list(jsonb) from public, anon, authenticated;
grant execute on function public.admin_import_merit_list(jsonb) to authenticated;

-- Allow the admin user to verify their own allow-list row only.
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
drop policy if exists "Admins can read their own allow-list entry" on public.admin_users;
create policy "Admins can read their own allow-list entry"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Expected behavior:
-- 1) Anonymous/public score form insert: allowed, but source/import metadata must remain public defaults.
-- 2) Anonymous call to admin_import_merit_list: denied.
-- 3) Authenticated non-admin call to admin_import_merit_list: rejected by the function's allow-list check.
-- 4) Authenticated allow-listed admin call: permitted by the protected import function.
-- 5) Public dashboard RPC continues returning aggregate statistics only.
