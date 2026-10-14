-- EMRS MeritScope: privacy-preserving score rank prediction.
-- Apply after supabase/schema.sql and, if using the persistent import, the admin import migration.
-- Returns aggregates only; it never returns candidate names or individual scores.

create or replace function public.get_rank_prediction(
  p_post_applied text,
  p_tier2_score numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_higher bigint;
  v_at_or_below bigint;
  v_rank bigint;
  v_percentile numeric;
begin
  if p_post_applied not in ('TGT CS', 'PGT CS') then
    raise exception 'Invalid post. Use TGT CS or PGT CS';
  end if;
  if p_tier2_score is null or p_tier2_score < 0 or p_tier2_score > 100 then
    raise exception 'Score must be between 0 and 100';
  end if;

  select count(*),
         count(*) filter (where s.tier2_score > p_tier2_score),
         count(*) filter (where s.tier2_score <= p_tier2_score)
    into v_total, v_higher, v_at_or_below
    from public.candidate_submissions s
   where s.post_applied = p_post_applied;

  if v_total = 0 then
    return jsonb_build_object(
      'submitted_total', 0,
      'submitted_rank', null,
      'percentile', null
    );
  end if;

  v_rank := v_higher + 1;
  v_percentile := round((v_at_or_below::numeric / v_total::numeric) * 100, 2);

  return jsonb_build_object(
    'submitted_total', v_total,
    'submitted_rank', v_rank,
    'percentile', v_percentile
  );
end;
$$;

revoke all on function public.get_rank_prediction(text, numeric) from public;
grant execute on function public.get_rank_prediction(text, numeric) to anon, authenticated;

comment on function public.get_rank_prediction(text, numeric) is
  'Returns aggregate rank and percentile for a supplied score among stored submissions for one post; exposes no candidate-level data.';
