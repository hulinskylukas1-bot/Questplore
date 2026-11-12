-- Historie her: body (zatím nevyužité), automatické označení dokončené hry, přehled pro administrátory.

-- Body za hru – zatím se nevyplňují, bodový systém se teprve navrhuje.
alter table public.game_sessions add column if not exists score integer;

-- Když přehrávač zapíše událost game_finished, hra se označí jako dokončená.
create or replace function public.mark_session_completed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.event_type = 'game_finished' then
    update public.game_sessions
    set status = 'completed', completed_at = now()
    where id = new.session_id;
  end if;
  return new;
end $$;

revoke all on function public.mark_session_completed() from public, anon, authenticated;

drop trigger if exists trg_mark_session_completed on public.progress_events;
create trigger trg_mark_session_completed
  after insert on public.progress_events
  for each row execute function public.mark_session_completed();

-- Přehled her pro administrátory.
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
        coalesce(s.completed_at, s.started_at) as sort_at,
        o.email,
        o.customer_name,
        l.code as license_code,
        (l.order_id is null) as is_test,
        coalesce(
          nullif(s.state ->> 'finishedSec', '')::numeric,
          case when s.completed_at is not null then extract(epoch from s.completed_at - s.started_at) end,
          nullif(s.state ->> 'elapsedSec', '')::numeric
        ) as duration_sec,
        s.score,
        (select count(*) from public.progress_events e where e.session_id = s.id and e.event_type = 'hint_used') as hints_used,
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

revoke all on function public.admin_game_history(boolean, uuid) from public, anon, authenticated;
grant execute on function public.admin_game_history(boolean, uuid) to authenticated;
