-- EMRS MeritScope database setup. Review score maximum before running.
-- This example assumes Tier 2 scores are out of 100. Change validation if official maximum differs.
create table if not exists public.candidate_submissions (
  id bigint generated always as identity primary key,
  candidate_name text not null check (char_length(trim(candidate_name)) between 1 and 100),
  post_applied text not null check (post_applied in ('TGT CS', 'PGT CS')),
  category text not null check (category in ('UR', 'OBC-NCL', 'SC', 'ST', 'EWS')),
  tier1_qualified boolean not null,
  tier1_category text check (tier1_category is null or tier1_category in ('UR', 'OBC-NCL', 'SC', 'ST', 'EWS')),
  tier2_score numeric(6,2) not null check (tier2_score >= 0 and tier2_score <= 100),
  relaxation_used text not null default 'Prefer not to say' check (relaxation_used in ('Yes', 'No', 'Prefer not to say')),
  score_type text not null default 'Estimated' check (score_type in ('Verified', 'Estimated')),
  created_at timestamptz not null default now()
);

alter table public.candidate_submissions enable row level security;
revoke all on public.candidate_submissions from anon, authenticated;
grant insert (candidate_name, post_applied, category, tier1_qualified, tier1_category, tier2_score, relaxation_used, score_type) on public.candidate_submissions to anon, authenticated;

drop policy if exists "Allow candidate submissions" on public.candidate_submissions;
create policy "Allow candidate submissions" on public.candidate_submissions
for insert to anon, authenticated with check (true);

-- Dashboard returns aggregates only, not names or individual rows.
create or replace function public.get_public_dashboard()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'total_submissions', count(*),
    'score_90_plus', count(*) filter (where tier2_score >= 90),
    'score_85_plus', count(*) filter (where tier2_score >= 85),
    'score_80_plus', count(*) filter (where tier2_score >= 80),
    'average_score', round(avg(tier2_score), 2),
    'highest_score', max(tier2_score),
    'by_post_category', coalesce((
      select jsonb_agg(to_jsonb(stats)) from (
        select post_applied, category, count(*) as candidate_count,
          round(avg(tier2_score), 2) as average_score, max(tier2_score) as highest_score,
          count(*) filter (where tier2_score >= 90) as score_90_plus,
          count(*) filter (where tier2_score >= 85) as score_85_plus,
          count(*) filter (where tier2_score >= 80) as score_80_plus
        from public.candidate_submissions group by post_applied, category
        order by post_applied, category
      ) stats
    ), '[]'::jsonb)
  ) from public.candidate_submissions;
$$;
revoke all on function public.get_public_dashboard() from public;
grant execute on function public.get_public_dashboard() to anon, authenticated;

-- IMPORTANT: public inserts can be spammed. Before a widely shared production launch,
-- add CAPTCHA/rate limiting or authenticated submissions and monitor Supabase usage.
