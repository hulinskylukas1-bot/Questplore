-- Podpora hráčů pro administrátory: vyhledání kódu, uvolnění zařízení, vydání nového kódu.
-- Všechny funkce jsou dostupné pouze přihlášeným administrátorům (is_admin()).

create or replace function public.admin_player_lookup(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_l public.licenses%rowtype;
  v_s public.game_sessions%rowtype;
  v_game public.games%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_l from public.licenses where upper(code) = upper(trim(p_code)) limit 1;
  if v_l.id is null then raise exception 'LICENSE_NOT_FOUND'; end if;

  select * into v_game from public.games where id = v_l.game_id;

  select * into v_s from public.game_sessions
  where license_id = v_l.id
  order by started_at desc limit 1;

  return jsonb_build_object(
    'license', jsonb_build_object(
      'id', v_l.id, 'code', v_l.code, 'status', v_l.status,
      'activated_at', v_l.activated_at, 'order_id', v_l.order_id),
    'game', jsonb_build_object(
      'id', v_game.id, 'name', v_game.name, 'max_devices', v_game.max_devices),
    'session', case when v_s.id is null then null else jsonb_build_object(
      'id', v_s.id,
      'status', v_s.status,
      'started_at', v_s.started_at,
      'last_activity', v_s.state_updated_at,
      'stage_name', (select internal_name from public.stages where id = v_s.current_stage_id),
      'stage_position', (select position from public.stages where id = v_s.current_stage_id),
      'stages_total', (select count(*) from public.stages where game_version_id = v_s.game_version_id),
      'elapsed_sec', v_s.state -> 'elapsedSec',
      'finished_sec', v_s.state -> 'finishedSec') end,
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.device_name, 'joined_at', d.joined_at, 'last_seen_at', d.last_seen_at)
        order by d.joined_at)
      from public.session_devices d where d.session_id = v_s.id), '[]'::jsonb),
    'hints_used', case when v_s.id is null then 0 else (
      select count(*) from public.progress_events e
      where e.session_id = v_s.id and e.event_type = 'hint_used') end
  );
end $$;

create or replace function public.admin_release_devices(p_license_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count integer := 0;
  v_session uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select id into v_session from public.game_sessions
  where license_id = p_license_id order by started_at desc limit 1;
  if v_session is null then return 0; end if;

  delete from public.session_devices where session_id = v_session;
  get diagnostics v_count = row_count;

  insert into public.progress_events(session_id, event_type, data)
  values (v_session, 'admin_devices_released', jsonb_build_object('released', v_count));

  return v_count;
end $$;

create or replace function public.admin_replace_license(p_license_id uuid, p_keep_progress boolean default true)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_old public.licenses%rowtype;
  v_code text;
  v_new uuid;
  v_session uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_old from public.licenses where id = p_license_id for update;
  if v_old.id is null then raise exception 'LICENSE_NOT_FOUND'; end if;
  if v_old.status = 'revoked' then raise exception 'LICENSE_ALREADY_REVOKED'; end if;

  select id into v_session from public.game_sessions
  where license_id = v_old.id and status in ('active', 'completed')
  order by started_at desc limit 1;

  v_code := public.generate_license_code();

  insert into public.licenses(game_id, order_id, code, status, activated_at)
  values (
    v_old.game_id, v_old.order_id, v_code,
    case when p_keep_progress and v_session is not null then 'active' else 'unused' end,
    case when p_keep_progress and v_session is not null then v_old.activated_at else null end)
  returning id into v_new;

  if p_keep_progress and v_session is not null then
    -- Postup se přesune pod nový kód, staré zařízení ztratí přístup (nový session token).
    update public.game_sessions
    set license_id = v_new,
        session_token = gen_random_uuid(),
        state_revision = state_revision + 1,
        state_updated_at = now()
    where id = v_session;
    delete from public.session_devices where session_id = v_session;
    insert into public.progress_events(session_id, event_type, data)
    values (v_session, 'admin_license_replaced',
            jsonb_build_object('old_license_id', v_old.id, 'new_license_id', v_new, 'kept_progress', true));
  else
    update public.game_sessions set status = 'abandoned'
    where license_id = v_old.id and status = 'active';
  end if;

  update public.licenses set status = 'revoked' where id = v_old.id;

  return v_code;
end $$;

-- Pouze přihlášení administrátoři; anonymní návštěvníci ne.
revoke all on function public.admin_player_lookup(text) from public, anon, authenticated;
revoke all on function public.admin_release_devices(uuid) from public, anon, authenticated;
revoke all on function public.admin_replace_license(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_player_lookup(text) to authenticated;
grant execute on function public.admin_release_devices(uuid) to authenticated;
grant execute on function public.admin_replace_license(uuid, boolean) to authenticated;
