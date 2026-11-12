-- Časové limity: 24 hodin na dokončení hry a roční platnost dárkových poukazů.

alter table public.games
  add column if not exists session_hours integer not null default 24 check (session_hours >= 1);
alter table public.licenses add column if not exists expires_at timestamptz;
alter table public.game_sessions add column if not exists expires_at timestamptz;

-- Start / pokračování hry: nová hra dostane konec platnosti, vypršelý poukaz hru nespustí.
create or replace function public.start_or_resume_game(p_code text, p_device_token uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_license public.licenses%rowtype;
  v_session public.game_sessions%rowtype;
  v_version uuid;
  v_stage uuid;
  v_device uuid;
  v_max_devices integer;
  v_device_count integer;
  v_hours integer;
  v_expired boolean;
begin
  select * into v_license
  from public.licenses
  where upper(code)=upper(trim(p_code))
    and status in ('active','unused','issued')
  limit 1;

  if v_license.id is null then raise exception 'INVALID_GAME_CODE'; end if;

  select * into v_session
  from public.game_sessions
  where license_id=v_license.id and status in ('active','completed')
  order by started_at desc limit 1;

  if v_session.id is null then
    -- Poukaz, který nebyl včas využit, hru nespustí.
    if v_license.expires_at is not null and v_license.expires_at < now() then
      raise exception 'LICENSE_EXPIRED';
    end if;

    select gv.id into v_version
    from public.game_versions gv
    where gv.game_id=v_license.game_id
    order by (gv.status='published') desc, gv.version_number desc
    limit 1;

    select s.id into v_stage
    from public.stages s
    where s.game_version_id=v_version
    order by s.position
    limit 1;

    select coalesce(g.session_hours, 24) into v_hours from public.games g where g.id=v_license.game_id;

    insert into public.game_sessions(license_id,game_version_id,current_stage_id,status,expires_at)
    values(v_license.id,v_version,v_stage,'active', now() + make_interval(hours => v_hours))
    returning * into v_session;

    update public.licenses
    set status='active',activated_at=coalesce(activated_at,now())
    where id=v_license.id;
  end if;

  v_expired := v_session.status='active' and v_session.expires_at is not null and v_session.expires_at < now();

  select g.max_devices into v_max_devices
  from public.games g where g.id=v_license.game_id;

  if p_device_token is not null then
    select sd.id into v_device
    from public.session_devices sd
    where sd.session_id=v_session.id and sd.device_token=p_device_token;

    if v_device is null then
      select count(*) into v_device_count
      from public.session_devices sd
      where sd.session_id=v_session.id;

      if v_device_count >= coalesce(v_max_devices,3) then
        raise exception 'DEVICE_LIMIT_REACHED';
      end if;

      insert into public.session_devices(session_id,device_token,device_name)
      values(v_session.id,p_device_token,'Player')
      returning id into v_device;
    else
      update public.session_devices set last_seen_at=now() where id=v_device;
    end if;
  end if;

  return jsonb_build_object(
    'session_id',v_session.id,
    'session_token',v_session.session_token,
    'game_version_id',v_session.game_version_id,
    'current_stage_id',v_session.current_stage_id,
    'current_block_id',v_session.current_block_id,
    'status',v_session.status,
    'state',v_session.state,
    'revision',v_session.state_revision,
    'device_id',v_device,
    'max_devices',coalesce(v_max_devices,3),
    'expires_at',v_session.expires_at,
    'expired',v_expired
  );
end
$$;

-- Průběžné ukládání: po vypršení limitu se hra zamkne.
create or replace function public.save_game_progress(p_session_token uuid, p_stage_id uuid, p_block_id uuid, p_event_type text, p_data jsonb default '{}'::jsonb, p_state jsonb default null::jsonb, p_device_token uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
 v_session public.game_sessions%rowtype; v_device uuid;
 v_current jsonb; v_merged jsonb;
 v_in_rank bigint := 0; v_cur_rank bigint := 0;
 v_in_step bigint := 0; v_cur_step bigint := 0;
 v_accept boolean := false; v_revision bigint;
begin
 select * into v_session from public.game_sessions where session_token=p_session_token limit 1 for update;
 if v_session.id is null then raise exception 'INVALID_SESSION'; end if;

 if v_session.status='active' and v_session.expires_at is not null and v_session.expires_at < now() then
   raise exception 'SESSION_EXPIRED';
 end if;

 if p_device_token is not null then
   select id into v_device from public.session_devices where session_id=v_session.id and device_token=p_device_token;
   if v_device is not null then update public.session_devices set last_seen_at=now() where id=v_device; end if;
 end if;

 v_current := coalesce(v_session.state,'{}'::jsonb);
 v_merged := v_current;

 if p_state is not null then
   if (p_state ? 'progressStep') then
     v_cur_step := coalesce((v_current->>'progressStep')::bigint,0);
     v_in_step := coalesce((p_state->>'progressStep')::bigint,0);
     v_accept := v_in_step > v_cur_step;
   else
     v_cur_rank := coalesce((v_current->>'stageIndex')::bigint,0)*100000 + coalesce((v_current->>'cursor')::bigint,0);
     v_in_rank := coalesce((p_state->>'stageIndex')::bigint,0)*100000 + coalesce((p_state->>'cursor')::bigint,0);
     v_accept := v_in_rank > v_cur_rank;
   end if;

   if v_accept then
     v_merged := v_current || (p_state - 'solved' - 'choices' - 'responses' - 'quizAnswers');
   end if;

   v_merged := jsonb_set(v_merged,'{solved}',
      coalesce(p_state->'solved','{}'::jsonb) || coalesce(v_current->'solved','{}'::jsonb),true);
   v_merged := jsonb_set(v_merged,'{choices}',
      coalesce(p_state->'choices','{}'::jsonb) || coalesce(v_current->'choices','{}'::jsonb),true);
   v_merged := jsonb_set(v_merged,'{responses}',
      coalesce(p_state->'responses','{}'::jsonb) || coalesce(v_current->'responses','{}'::jsonb),true);
   v_merged := jsonb_set(v_merged,'{quizAnswers}',
      coalesce(p_state->'quizAnswers','{}'::jsonb) || coalesce(v_current->'quizAnswers','{}'::jsonb),true);
 end if;

 update public.game_sessions
 set current_stage_id=case when v_accept then p_stage_id else current_stage_id end,
     current_block_id=case when v_accept then p_block_id else current_block_id end,
     state=v_merged,state_revision=state_revision+1,state_updated_at=now()
 where id=v_session.id returning state_revision into v_revision;

 insert into public.progress_events(session_id,stage_id,block_id,device_id,event_type,data)
 values(v_session.id,p_stage_id,p_block_id,v_device,p_event_type,coalesce(p_data,'{}'::jsonb));

 if p_event_type='gps_confirmed' then
   insert into public.evidence(session_id,stage_id,block_id,evidence_type,metadata)
   values(v_session.id,p_stage_id,p_block_id,'gps',
     coalesce(p_data,'{}'::jsonb) || jsonb_build_object('device_id',v_device,'captured_at',now()));
 end if;

 return jsonb_build_object('ok',true,'accepted',v_accept,'session_id',v_session.id,'revision',v_revision,'state',v_merged);
end $$;

-- Synchronizace mezi zařízeními: vrací i konec platnosti a příznak vypršení.
create or replace function public.get_session_progress(p_session_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
 select jsonb_build_object(
 'session_id',gs.id,'game_version_id',gs.game_version_id,
 'current_stage_id',gs.current_stage_id,'current_block_id',gs.current_block_id,
 'status',gs.status,'state',gs.state,'revision',gs.state_revision,'state_updated_at',gs.state_updated_at,
 'expires_at',gs.expires_at,
 'expired',(gs.status='active' and gs.expires_at is not null and gs.expires_at < now()))
 from public.game_sessions gs where gs.session_token=p_session_token limit 1
$$;

-- Administrátor může hru prodloužit (např. když se hráčům něco pokazí).
create or replace function public.admin_extend_session(p_license_id uuid, p_hours integer default 24)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_session public.game_sessions%rowtype;
  v_new timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 720 then raise exception 'INVALID_HOURS'; end if;

  select * into v_session from public.game_sessions
  where license_id = p_license_id and status = 'active'
  order by started_at desc limit 1 for update;
  if v_session.id is null then raise exception 'NO_ACTIVE_SESSION'; end if;

  v_new := greatest(coalesce(v_session.expires_at, now()), now()) + make_interval(hours => p_hours);
  update public.game_sessions
  set expires_at = v_new, state_revision = state_revision + 1, state_updated_at = now()
  where id = v_session.id;

  insert into public.progress_events(session_id, event_type, data)
  values (v_session.id, 'admin_session_extended', jsonb_build_object('hours', p_hours, 'expires_at', v_new));

  return v_new;
end $$;
revoke all on function public.admin_extend_session(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_extend_session(uuid, integer) to authenticated;

-- Vyhledání hráče: přidán konec platnosti hry a poukazu.
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
      'activated_at', v_l.activated_at, 'order_id', v_l.order_id, 'expires_at', v_l.expires_at),
    'game', jsonb_build_object(
      'id', v_game.id, 'name', v_game.name, 'max_devices', v_game.max_devices),
    'session', case when v_s.id is null then null else jsonb_build_object(
      'id', v_s.id,
      'status', v_s.status,
      'started_at', v_s.started_at,
      'last_activity', v_s.state_updated_at,
      'expires_at', v_s.expires_at,
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

-- Vydání poukazu: platnost 1 rok od vydání.
create or replace function public.admin_issue_gift_voucher(p_request_id uuid, p_amount integer default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  r public.gift_requests%rowtype;
  v_order public.orders%rowtype;
  v_license public.licenses%rowtype;
  v_expires timestamptz := now() + interval '1 year';
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into r from public.gift_requests where id = p_request_id for update;
  if r.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status not in ('new', 'paid') then raise exception 'REQUEST_NOT_ISSUABLE'; end if;

  insert into public.orders(email, status, amount, currency, game_id, payment_provider, paid_at, customer_name, metadata)
  values (r.buyer_email, 'paid', p_amount, 'CZK', r.game_id, 'manual', now(), r.buyer_name,
          jsonb_build_object('gift', true, 'request_id', r.id, 'recipient_name', r.recipient_name))
  returning * into v_order;

  v_license := public.issue_license_for_paid_order(v_order.id);

  update public.licenses set expires_at = v_expires where id = v_license.id;
  update public.orders set fulfilled_at = now() where id = v_order.id;
  update public.gift_requests
  set status = 'issued', license_id = v_license.id, issued_at = now()
  where id = r.id;

  return jsonb_build_object('ok', true, 'code', v_license.code, 'license_id', v_license.id, 'expires_at', v_expires);
end $$;
