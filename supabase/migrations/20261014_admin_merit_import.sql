-- EMRS MeritScope: protected, idempotent TGT CS merit-list import.
-- Apply after the base supabase/schema.sql in project ggumftjadfhofenealxs.
-- This migration does not insert the CSV automatically.

alter table public.candidate_submissions
  alter column tier1_qualified drop not null,
  add column if not exists candidate_rank integer,
  add column if not exists dv_status text,
  add column if not exists other_govt_job text,
  add column if not exists source text not null default 'public_submission',
  add column if not exists import_key text,
  add column if not exists import_batch_id uuid;

create unique index if not exists candidate_submissions_import_key_uidx
  on public.candidate_submissions(import_key)
  where import_key is not null;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
drop policy if exists "Admins can read their own allow-list entry" on public.admin_users;
create policy "Admins can read their own allow-list entry"
  on public.admin_users for select to authenticated
  using (auth.uid() = user_id);

-- Do not grant public direct write access to source/import metadata.
revoke insert, update, delete on public.candidate_submissions from anon, authenticated;
grant insert (candidate_name, post_applied, category, tier1_qualified, tier1_category, tier2_score, relaxation_used, score_type)
  on public.candidate_submissions to anon, authenticated;

create or replace function public.admin_import_merit_list(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_rank integer;
  v_name text;
  v_category text;
  v_score numeric;
  v_relaxation text;
  v_dv_status text;
  v_other_job text;
  v_import_key text;
  v_inserted integer := 0;
  v_batch_inserted integer := 0;
  v_received integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) > 100 then
    raise exception 'Import batches may contain at most 100 rows';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) as e(value)
  loop
    v_received := v_received + 1;
    if coalesce(v_row->>'candidate_rank','') !~ '^[0-9]+$'
       or (v_row->>'candidate_rank')::integer < 1 then
      raise exception 'Invalid candidate rank in import batch';
    end if;
    v_rank := (v_row->>'candidate_rank')::integer;
    v_name := nullif(trim(v_row->>'candidate_name'), '');
    v_category := v_row->>'category';
    if v_name is null or char_length(v_name) > 100 then
      raise exception 'Candidate name is required and must be at most 100 characters';
    end if;
    if v_category not in ('UR','OBC-NCL','SC','ST','EWS') then
      raise exception 'Invalid candidate category in import batch';
    end if;
    if coalesce(v_row->>'tier2_score','') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Invalid marks in import batch';
    end if;
    v_score := (v_row->>'tier2_score')::numeric;
    if v_score < 0 or v_score > 100 then
      raise exception 'Marks must be between 0 and 100';
    end if;
    v_relaxation := case v_row->>'relaxation_used'
      when 'Yes' then 'Yes' when 'No' then 'No' else 'Prefer not to say' end;
    v_dv_status := left(coalesce(nullif(trim(v_row->>'dv_status'), ''), 'Not Specified'), 100);
    v_other_job := left(coalesce(nullif(trim(v_row->>'other_govt_job'), ''), 'Not Specified'), 150);
    v_import_key := nullif(trim(v_row->>'import_key'), '');
    if v_import_key is null or char_length(v_import_key) > 160 then
      raise exception 'An import key is required for each row';
    end if;

    insert into public.candidate_submissions
      (candidate_name, post_applied, category, tier1_qualified, tier1_category,
       tier2_score, relaxation_used, score_type, candidate_rank, dv_status,
       other_govt_job, source, import_key)
    values
      (v_name, 'TGT CS', v_category, null, null, v_score, v_relaxation, 'Estimated',
       v_rank, v_dv_status, v_other_job, 'imported_merit_list', v_import_key)
    on conflict (import_key) where import_key is not null do nothing;

    get diagnostics v_batch_inserted = row_count;
    v_inserted := v_inserted + v_batch_inserted;
  end loop;

  return jsonb_build_object(
    'received', v_received,
    'inserted', v_inserted,
    'skipped', v_received - v_inserted
  );
end;
$$;

revoke all on function public.admin_import_merit_list(jsonb) from public, anon;
grant execute on function public.admin_import_merit_list(jsonb) to authenticated;

-- Admin allow-list setup:
-- 1. Create an admin account under Supabase Dashboard > Authentication > Users.
-- 2. Copy that user's UUID and run:
--    insert into public.admin_users(user_id) values ('YOUR-AUTH-USER-UUID');
-- Only allow-listed authenticated users can execute the import RPC.
