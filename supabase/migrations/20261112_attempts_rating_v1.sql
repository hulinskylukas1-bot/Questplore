-- Chybné pokusy, hodnocení hry, fotodůkazy pro administrátory a rozšířená historie her.

-- Hodnocení hráče po dohrání.
alter table public.game_sessions
  add column if not exists rating smallint check (rating between 1 and 5),
  add column if not exists rating_comment text,
  add column if not exists rated_at timestamptz;

-- Administrátoři smějí zobrazit fotodůkazy v soukromém úložišti.
drop policy if exists questplore_admin_game_evidence_select on storage.objects;
create policy questplore_admin_game_evidence_select on storage.objects
  for select to authenticated
  using (bucket_id = 'game-evidence' and public.is_admin());

-- Lehký záznam události (např. chybný pokus) – nemění postup ve hře ani revizi.
create or replace function public.log_game_event(
  p_session_token uuid, p_device_token uuid, p_stage_id uuid, p_block_id uuid,
  p_event_type text, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_session uuid;
  v_device uuid;
begin
  if p_event_type not in ('attempt_wrong') then raise exception 'EVENT_NOT_ALLOWED'; end if;
  if pg_column_size(coalesce(p_data, '{}'::jsonb)) > 4000 then raise exception 'EVENT_TOO_LARGE'; end if;

  select id into v_session from public.game_sessions where session_token = p_session_token limit 1;
  if v_session is null then raise exception 'INVALID_SESSION'; end if;

  if p_device_token is not null then
    select id into v_device from public.session_devices where session_id = v_session and device_token = p_device_token;
  end if;

  insert into public.progress_events(session_id, stage_id, block_id, device_id, event_type, data)
  values (v_session, p_stage_id, p_block_id, v_device, p_event_type, coalesce(p_data, '{}'::jsonb));

  return jsonb_build_object('ok', true);
end $$;

-- Hodnocení po hře (1–5 hvězdiček + volitelný komentář).
create or replace function public.submit_game_rating(
  p_session_token uuid, p_device_token uuid, p_rating integer, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_session uuid;
  v_device uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'INVALID_RATING'; end if;

  select id into v_session from public.game_sessions where session_token = p_session_token limit 1;
  if v_session is null then raise exception 'INVALID_SESSION'; end if;

  select id into v_device from public.session_devices where session_id = v_session and device_token = p_device_token;
  if v_device is null then raise exception 'INVALID_DEVICE'; end if;

  update public.game_sessions
  set rating = p_rating,
      rating_comment = nullif(left(trim(coalesce(p_comment, '')), 1000), ''),
      rated_at = now()
  where id = v_session;

  insert into public.progress_events(session_id, device_id, event_type, data)
  values (v_session, v_device, 'rating_submitted', jsonb_build_object('rating', p_rating));

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.log_game_event(uuid, uuid, uuid, uuid, text, jsonb) from public;
revoke all on function public.submit_game_rating(uuid, uuid, integer, text) from public;
grant execute on function public.log_game_event(uuid, uuid, uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.submit_game_rating(uuid, uuid, integer, text) to anon, authenticated;

-- Rozšířená historie her: chybné pokusy, hodnocení, kde hráči skončili.
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
