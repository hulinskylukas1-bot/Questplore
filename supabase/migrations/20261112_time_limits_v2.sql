-- Historie her: přidán konec platnosti hry, aby administrace rozlišila hry, kterým vypršel čas.
create or replace function public.admin_game_history(p_include_unfinished boolean default false, p_game_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  return coalesce((
    select jsonb_agg(r order by r.sort_at desc) from (
      select
        s.id as session_id,
        g.id as game_id,
        g.name as game_name,
        gv.version_number,
        s.status,
        s.started_at,
        s.completed_at,
        s.expires_at,
        coalesce(s.completed_at, s.started_at) as sort_at,
        o.email,
        o.customer_name,
        l.code as license_code,
        public.is_test_order(l.order_id) as is_test,
        coalesce(
          nullif(s.state ->> 'finishedSec', '')::numeric,
          case when s.completed_at is not null then extract(epoch from s.completed_at - s.started_at) end,
          nullif(s.state ->> 'elapsedSec', '')::numeric
        ) as duration_sec,
        s.score,
        s.rating,
        s.rating_comment,
        s.state_updated_at as last_activity,
        (select st.internal_name from public.stages st where st.id = s.current_stage_id) as stage_name,
        (select st.position from public.stages st where st.id = s.current_stage_id) as stage_position,
        (select count(*) from public.stages st where st.game_version_id = s.game_version_id) as stages_total,
        (select left(coalesce(bt.content ->> 'text', bt.content ->> 'prompt', ''), 100)
           from public.block_translations bt where bt.block_id = s.current_block_id limit 1) as current_task,
        (select count(*) from public.progress_events e where e.session_id = s.id and e.event_type = 'hint_used') as hints_used,
        (select count(*) from public.progress_events e where e.session_id = s.id and e.event_type = 'attempt_wrong') as wrong_attempts,
        (select count(*) from public.session_devices d where d.session_id = s.id) as devices_count
      from public.game_sessions s
      join public.licenses l on l.id = s.license_id
      join public.game_versions gv on gv.id = s.game_version_id
      join public.games g on g.id = gv.game_id
      left join public.orders o on o.id = l.order_id
      where (p_include_unfinished or s.status = 'completed')
        and (p_game_id is null or g.id = p_game_id)
      order by coalesce(s.completed_at, s.started_at) desc
      limit 500
    ) r
  ), '[]'::jsonb);
end $$;
