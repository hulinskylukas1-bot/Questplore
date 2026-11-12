-- Questplore – databázové funkce (stav k 12. 11. 2026).
-- Funkce vytvořené později jsou v supabase/migrations/20261112_*.sql:
--   admin_player_lookup, admin_release_devices, admin_replace_license, admin_list_test_licenses,
--   admin_delete_test_license, admin_game_history, is_test_order, log_game_event, submit_game_rating,
--   mark_session_completed.

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_customer_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
  begin
    new.updated_at = now();
    return new;
  end;
  $function$;

CREATE OR REPLACE FUNCTION public.set_email_template_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
  begin
    new.updated_at = now();
    return new;
  end;
  $function$;

CREATE OR REPLACE FUNCTION public.generate_license_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_code text;
begin
  loop
    v_code := 'HA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4))
                  || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
    exit when not exists (select 1 from public.licenses where code=v_code);
  end loop;
  return v_code;
end
$function$;

-- ===== Správa správců =====

CREATE OR REPLACE FUNCTION public.admin_list_access()
 RETURNS TABLE(user_id uuid, email text, granted_at timestamp with time zone, is_current_user boolean, pending boolean, invite_id uuid, invite_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  begin
    if not public.is_admin() then
      raise exception 'Not authorized';
    end if;

    return query
    select
      au.user_id,
      u.email::text,
      au.created_at as granted_at,
      au.user_id = auth.uid() as is_current_user,
      false as pending,
      null::uuid as invite_id,
      null::timestamptz as invite_expires_at
    from public.admin_users au
    left join auth.users u on u.id = au.user_id

    union all

    select
      ai.invited_user_id as user_id,
      ai.email,
      ai.created_at as granted_at,
      false as is_current_user,
      true as pending,
      ai.id as invite_id,
      ai.expires_at as invite_expires_at
    from public.admin_invites ai
    where ai.claimed_at is null
      and ai.cancelled_at is null
      and ai.expires_at > now()

    order by pending, granted_at;
  end;
  $function$;

CREATE OR REPLACE FUNCTION public.admin_cancel_invite(p_invite_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  begin
    if not public.is_admin() then
      raise exception 'Not authorized';
    end if;

    update public.admin_invites
    set cancelled_at = now()
    where id = p_invite_id
      and claimed_at is null
      and cancelled_at is null;

    return found;
  end;
  $function$;

CREATE OR REPLACE FUNCTION public.admin_revoke_access(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    v_count integer;
  begin
    if not public.is_admin() then
      raise exception 'Not authorized';
    end if;
    if p_user_id = auth.uid() then
      raise exception 'You cannot revoke your own access';
    end if;

    select count(*) into v_count from public.admin_users;
    if v_count <= 1 then
      raise exception 'At least one administrator must remain';
    end if;

    delete from public.admin_users where user_id = p_user_id;
    return found;
  end;
  $function$;

CREATE OR REPLACE FUNCTION public.create_admin_invite(p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    v_email text := lower(btrim(coalesce(p_email,'')));
    v_token uuid := gen_random_uuid();
  begin
    if not public.is_admin() then
      raise exception 'Not authorized';
    end if;
    if v_email = '' or position('@' in v_email) < 2 then
      raise exception 'Invalid email';
    end if;

    update public.admin_invites
    set expires_at = now()
    where lower(email)=v_email and claimed_at is null and expires_at > now();

    insert into public.admin_invites(email,token,expires_at)
    values (v_email,v_token,now()+interval '14 days');

    return v_token;
  end;
  $function$;

CREATE OR REPLACE FUNCTION public.admin_invite_info(p_token uuid)
 RETURNS TABLE(email text, valid boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select ai.email,
           (ai.claimed_at is null and ai.expires_at > now()) as valid
    from public.admin_invites ai
    where ai.token = p_token
    limit 1;
  $function$;

CREATE OR REPLACE FUNCTION public.pending_admin_invite()
 RETURNS TABLE(email text, valid boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select ai.email,
           (ai.claimed_at is null and ai.cancelled_at is null and ai.expires_at > now()) as valid
    from public.admin_invites ai
    where ai.invited_user_id = auth.uid()
    order by ai.created_at desc
    limit 1;
  $function$;

CREATE OR REPLACE FUNCTION public.claim_admin_invite(p_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    v_uid uuid := auth.uid();
    v_email text := lower(coalesce(auth.jwt()->>'email',''));
    v_invite public.admin_invites%rowtype;
  begin
    if v_uid is null or v_email = '' then
      return false;
    end if;

    select * into v_invite
    from public.admin_invites
    where token = p_token
    for update;

    if not found then return false; end if;
    if v_invite.claimed_at is not null or v_invite.expires_at <= now() then return false; end if;
    if lower(v_invite.email) <> v_email then return false; end if;

    insert into public.admin_users(user_id)
    values (v_uid)
    on conflict do nothing;

    update public.admin_invites
    set claimed_by = v_uid, claimed_at = now()
    where id = v_invite.id;

    return true;
  end;
  $function$;

CREATE OR REPLACE FUNCTION public.claim_pending_admin_invite()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    v_uid uuid := auth.uid();
    v_invite_id uuid;
  begin
    if v_uid is null then return false; end if;

    select ai.id into v_invite_id
    from public.admin_invites ai
    where ai.invited_user_id = v_uid
      and ai.claimed_at is null
      and ai.cancelled_at is null
      and ai.expires_at > now()
    order by ai.created_at desc
    limit 1
    for update;

    if v_invite_id is null then return false; end if;

    insert into public.admin_users(user_id)
    values (v_uid)
    on conflict do nothing;

    update public.admin_invites
    set claimed_by=v_uid, claimed_at=now()
    where id=v_invite_id;

    return true;
  end;
  $function$;

-- ===== Editor her =====

CREATE OR REPLACE FUNCTION public.admin_create_game(p_name text, p_slug text, p_city text DEFAULT NULL::text, p_min_players integer DEFAULT NULL::integer, p_max_players integer DEFAULT NULL::integer, p_max_devices integer DEFAULT 1, p_duration_min integer DEFAULT NULL::integer, p_duration_max integer DEFAULT NULL::integer, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_locale text DEFAULT 'cs'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_game public.games;
  v_version public.game_versions;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if coalesce(trim(p_name),'') = '' then raise exception 'GAME_NAME_REQUIRED'; end if;
  if coalesce(trim(p_slug),'') = '' then raise exception 'GAME_SLUG_REQUIRED'; end if;

  insert into public.games(
    name, slug, city, status, min_players, max_players, max_devices,
    default_locale, estimated_duration_min, estimated_duration_max
  )
  values (
    trim(p_name), lower(trim(p_slug)), nullif(trim(coalesce(p_city,'')),''),
    'draft', p_min_players, p_max_players, coalesce(p_max_devices,1),
    coalesce(nullif(trim(p_locale),''),'cs'), p_duration_min, p_duration_max
  )
  returning * into v_game;

  insert into public.game_versions(game_id, version_number, status)
  values (v_game.id, 1, 'draft')
  returning * into v_version;

  insert into public.game_translations(game_version_id, locale, title, description)
  values (
    v_version.id,
    coalesce(nullif(trim(p_locale),''),'cs'),
    coalesce(nullif(trim(coalesce(p_title,'')),''), trim(p_name)),
    nullif(trim(coalesce(p_description,'')),'')
  );

  return jsonb_build_object('game_id',v_game.id,'version_id',v_version.id,'version_number',1);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_clone_version(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source public.game_versions;
  v_new public.game_versions;
  s record;
  b record;
  new_stage_id uuid;
  new_block_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_source
  from public.game_versions
  where game_id=p_game_id
  order by version_number desc
  limit 1;

  if v_source.id is null then raise exception 'SOURCE_VERSION_NOT_FOUND'; end if;

  insert into public.game_versions(game_id,version_number,status)
  values (
    p_game_id,
    coalesce((select max(version_number)+1 from public.game_versions where game_id=p_game_id),1),
    'draft'
  )
  returning * into v_new;

  insert into public.game_translations(game_version_id,locale,title,description)
  select v_new.id,locale,title,description
  from public.game_translations
  where game_version_id=v_source.id;

  create temporary table if not exists questplore_stage_map(old_id uuid primary key,new_id uuid not null) on commit drop;
  create temporary table if not exists questplore_block_map(old_id uuid primary key,new_id uuid not null) on commit drop;
  truncate questplore_stage_map;
  truncate questplore_block_map;

  for s in
    select * from public.stages where game_version_id=v_source.id order by position,id
  loop
    insert into public.stages(game_version_id,internal_name,internal_note,position)
    values(v_new.id,s.internal_name,s.internal_note,s.position)
    returning id into new_stage_id;
    insert into questplore_stage_map values(s.id,new_stage_id);

    for b in
      select * from public.blocks where stage_id=s.id order by position,id
    loop
      insert into public.blocks(stage_id,block_type,position,config)
      values(new_stage_id,b.block_type,b.position,b.config)
      returning id into new_block_id;
      insert into questplore_block_map values(b.id,new_block_id);

      insert into public.block_translations(block_id,locale,content)
      select new_block_id,locale,content
      from public.block_translations
      where block_id=b.id;
    end loop;
  end loop;

  insert into public.transitions(game_version_id,from_stage_id,to_stage_id,condition,priority)
  select
    v_new.id,
    sf.new_id,
    st.new_id,
    case
      when bm.new_id is not null
      then jsonb_set(t.condition,'{choice,block_id}',to_jsonb(bm.new_id),false)
      else t.condition
    end,
    t.priority
  from public.transitions t
  left join questplore_stage_map sf on sf.old_id=t.from_stage_id
  left join questplore_stage_map st on st.old_id=t.to_stage_id
  left join questplore_block_map bm
    on (t.condition->'choice'->>'block_id') is not null
   and bm.old_id=(t.condition->'choice'->>'block_id')::uuid
  where t.game_version_id=v_source.id;

  return jsonb_build_object('ok',true,'game_id',p_game_id,'version_id',v_new.id,'version_number',v_new.version_number);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_publish_version(p_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_game_id uuid;
  v_version integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select game_id, version_number into v_game_id, v_version
  from public.game_versions
  where id = p_version_id
  for update;

  if v_game_id is null then raise exception 'VERSION_NOT_FOUND'; end if;

  update public.game_versions
  set status='archived'
  where game_id=v_game_id
    and status='published'
    and id<>p_version_id;

  update public.game_versions
  set status='published', published_at=coalesce(published_at, now())
  where id=p_version_id;

  update public.games set status='published' where id=v_game_id;

  return jsonb_build_object('ok',true,'game_id',v_game_id,'version_id',p_version_id,'version_number',v_version);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_issue_test_license(p_game_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_code text;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (
    select 1 from public.game_versions
    where game_id=p_game_id and status='published'
  ) then
    raise exception 'PUBLISHED_VERSION_REQUIRED';
  end if;
  v_code := public.generate_license_code();
  insert into public.licenses(game_id, order_id, code, status)
  values (p_game_id, null, v_code, 'unused');
  return v_code;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_game_preview(p_slug text, p_locale text DEFAULT 'cs'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'game', jsonb_build_object(
      'id', g.id, 'slug', g.slug, 'name', g.name, 'city', g.city,
      'min_players', g.min_players, 'max_players', g.max_players,
      'max_devices', g.max_devices, 'default_locale', g.default_locale
    ),
    'version', jsonb_build_object('id', gv.id, 'version_number', gv.version_number, 'status', gv.status),
    'translation', coalesce((
      select jsonb_build_object('title', gt.title, 'description', gt.description)
      from public.game_translations gt
      where gt.game_version_id = gv.id and gt.locale = p_locale limit 1
    ), '{}'::jsonb),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'internal_name', s.internal_name, 'position', s.position,
        'blocks', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', b.id, 'block_type', b.block_type, 'position', b.position,
            'config', b.config,
            'content', coalesce((
              select bt.content from public.block_translations bt
              where bt.block_id = b.id and bt.locale = p_locale limit 1
            ), '{}'::jsonb)
          ) order by b.position)
          from public.blocks b where b.stage_id = s.id
        ), '[]'::jsonb)
      ) order by s.position)
      from public.stages s where s.game_version_id = gv.id
    ), '[]'::jsonb),
    'transitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'from_stage_id', t.from_stage_id,
        'to_stage_id', t.to_stage_id,
        'condition', t.condition,
        'priority', t.priority
      ) order by t.priority desc, t.id)
      from public.transitions t
      where t.game_version_id = gv.id
    ), '[]'::jsonb)
  )
  from public.games g
  join lateral (
    select x.* from public.game_versions x
    where x.game_id = g.id
    order by case when x.status = 'published' then 0 else 1 end, x.version_number desc
    limit 1
  ) gv on true
  where g.slug = p_slug
  limit 1;
$function$;

-- ===== Nákup (zatím jen testovací) =====

CREATE OR REPLACE FUNCTION public.create_test_order(p_email text, p_customer_name text DEFAULT NULL::text, p_game_slug text DEFAULT 'spiknuti'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_game public.games%rowtype;
  v_order public.orders%rowtype;
begin
  if coalesce(trim(p_email),'') = '' or position('@' in p_email) < 2 then
    raise exception 'INVALID_EMAIL';
  end if;

  select * into v_game
  from public.games
  where slug=p_game_slug
  limit 1;

  if v_game.id is null then raise exception 'GAME_NOT_FOUND'; end if;

  insert into public.orders(
    email,status,amount,currency,game_id,payment_provider,customer_name,metadata
  )
  values(
    lower(trim(p_email)),'pending',null,'CZK',v_game.id,'test',
    nullif(trim(coalesce(p_customer_name,'')),''),
    jsonb_build_object('environment','test','game_slug',p_game_slug)
  )
  returning * into v_order;

  return jsonb_build_object(
    'order_id',v_order.id,
    'status',v_order.status,
    'email',v_order.email,
    'game_id',v_order.game_id,
    'environment','test'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.complete_test_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_license public.licenses%rowtype;
begin
  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_provider <> 'test' or coalesce(v_order.metadata->>'environment','') <> 'test' then
    raise exception 'NOT_TEST_ORDER';
  end if;

  if v_order.status <> 'paid' then
    update public.orders
    set status='paid',
        paid_at=coalesce(paid_at,now()),
        provider_payment_id=coalesce(provider_payment_id,'test_'||replace(v_order.id::text,'-',''))
    where id=v_order.id
    returning * into v_order;
  end if;

  v_license := public.issue_license_for_paid_order(v_order.id);

  update public.orders
  set fulfilled_at=coalesce(fulfilled_at,now())
  where id=v_order.id;

  return jsonb_build_object(
    'ok',true,
    'order_id',v_order.id,
    'status','paid',
    'email',v_order.email,
    'license_code',v_license.code,
    'license_status',v_license.status,
    'environment','test'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.issue_license_for_paid_order(p_order_id uuid)
 RETURNS licenses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_license public.licenses%rowtype;
begin
  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'paid' then raise exception 'ORDER_NOT_PAID'; end if;
  if v_order.game_id is null then raise exception 'ORDER_GAME_MISSING'; end if;

  select * into v_license
  from public.licenses
  where order_id=v_order.id
  limit 1;

  if v_license.id is not null then
    return v_license;
  end if;

  insert into public.licenses(game_id,order_id,code,status)
  values(v_order.game_id,v_order.id,public.generate_license_code(),'unused')
  returning * into v_license;

  return v_license;
end
$function$;

-- ===== Přehrávač (volané hráči s tajným tokenem relace) =====

CREATE OR REPLACE FUNCTION public.start_or_resume_game(p_code text, p_device_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_license public.licenses%rowtype;
  v_session public.game_sessions%rowtype;
  v_version uuid;
  v_stage uuid;
  v_device uuid;
  v_max_devices integer;
  v_device_count integer;
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

    insert into public.game_sessions(license_id,game_version_id,current_stage_id,status)
    values(v_license.id,v_version,v_stage,'active')
    returning * into v_session;

    update public.licenses
    set status='active',activated_at=coalesce(activated_at,now())
    where id=v_license.id;
  end if;

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
    'max_devices',coalesce(v_max_devices,3)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.get_session_game_content(p_session_token uuid, p_device_token uuid, p_locale text DEFAULT 'cs'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.game_sessions%rowtype;
  v_device uuid;
  v_game_id uuid;
  v_result jsonb;
begin
  select * into v_session
  from public.game_sessions
  where session_token = p_session_token
    and status in ('active','completed')
  limit 1;

  if v_session.id is null then
    raise exception 'INVALID_SESSION';
  end if;

  select id into v_device
  from public.session_devices
  where session_id = v_session.id
    and device_token = p_device_token
  limit 1;

  if v_device is null then
    raise exception 'INVALID_DEVICE';
  end if;

  select game_id into v_game_id
  from public.game_versions
  where id = v_session.game_version_id;

  if v_game_id is null then
    raise exception 'INVALID_GAME_VERSION';
  end if;

  select jsonb_build_object(
    'game', jsonb_build_object(
      'id', g.id, 'slug', g.slug, 'name', g.name, 'city', g.city,
      'min_players', g.min_players, 'max_players', g.max_players,
      'max_devices', g.max_devices, 'default_locale', g.default_locale
    ),
    'version', jsonb_build_object(
      'id', gv.id, 'version_number', gv.version_number, 'status', gv.status
    ),
    'translation', coalesce((
      select jsonb_build_object('title', gt.title, 'description', gt.description)
      from public.game_translations gt
      where gt.game_version_id = gv.id and gt.locale = p_locale
      limit 1
    ), '{}'::jsonb),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'internal_name', s.internal_name,
        'position', s.position,
        'blocks', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', b.id,
            'block_type', b.block_type,
            'position', b.position,
            'config', b.config,
            'content', coalesce((
              select bt.content
              from public.block_translations bt
              where bt.block_id = b.id and bt.locale = p_locale
              limit 1
            ), '{}'::jsonb)
          ) order by b.position)
          from public.blocks b
          where b.stage_id = s.id
        ), '[]'::jsonb)
      ) order by s.position)
      from public.stages s
      where s.game_version_id = gv.id
    ), '[]'::jsonb),
    'transitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'from_stage_id', t.from_stage_id,
        'to_stage_id', t.to_stage_id,
        'condition', t.condition,
        'priority', t.priority
      ) order by t.priority desc, t.id)
      from public.transitions t
      where t.game_version_id = gv.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.game_versions gv
  join public.games g on g.id = gv.game_id
  where gv.id = v_session.game_version_id;

  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.get_session_progress(p_session_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'session_id',gs.id,'game_version_id',gs.game_version_id,
 'current_stage_id',gs.current_stage_id,'current_block_id',gs.current_block_id,
 'status',gs.status,'state',gs.state,'revision',gs.state_revision,'state_updated_at',gs.state_updated_at)
 from public.game_sessions gs where gs.session_token=p_session_token limit 1
$function$;

CREATE OR REPLACE FUNCTION public.save_game_progress(p_session_token uuid, p_stage_id uuid, p_block_id uuid, p_event_type text, p_data jsonb DEFAULT '{}'::jsonb, p_state jsonb DEFAULT NULL::jsonb, p_device_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_session public.game_sessions%rowtype; v_device uuid;
 v_current jsonb; v_merged jsonb;
 v_in_rank bigint := 0; v_cur_rank bigint := 0;
 v_in_step bigint := 0; v_cur_step bigint := 0;
 v_accept boolean := false; v_revision bigint;
begin
 select * into v_session from public.game_sessions where session_token=p_session_token limit 1 for update;
 if v_session.id is null then raise exception 'INVALID_SESSION'; end if;

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
end $function$;

CREATE OR REPLACE FUNCTION public.reset_game_progress(p_session_token uuid, p_device_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.game_sessions%rowtype;
  v_device uuid;
  v_first_stage uuid;
  v_revision bigint;
  v_state jsonb;
begin
  select * into v_session
  from public.game_sessions
  where session_token = p_session_token
  limit 1
  for update;

  if v_session.id is null then
    raise exception 'INVALID_SESSION';
  end if;

  select id into v_device
  from public.session_devices
  where session_id = v_session.id
    and device_token = p_device_token
  limit 1;

  if v_device is null then
    raise exception 'INVALID_DEVICE';
  end if;

  select id into v_first_stage
  from public.stages
  where game_version_id = v_session.game_version_id
  order by position
  limit 1;

  v_state := jsonb_build_object(
    'stageIndex', 0,
    'cursor', 0,
    'progressStep', 0,
    'lastChoice', null,
    'choices', '{}'::jsonb,
    'solved', '{}'::jsonb,
    'responses', '{}'::jsonb,
    'quizAnswers', '{}'::jsonb,
    'seenBlockIds', '[]'::jsonb,
    'visitedStageIds', case when v_first_stage is null then '[]'::jsonb else jsonb_build_array(v_first_stage) end
  );

  update public.game_sessions
  set current_stage_id = v_first_stage,
      current_block_id = null,
      state = v_state,
      status = 'active',
      state_revision = state_revision + 1,
      state_updated_at = now()
  where id = v_session.id
  returning state_revision into v_revision;

  insert into public.progress_events(session_id, stage_id, block_id, device_id, event_type, data)
  values(v_session.id, v_first_stage, null, v_device, 'session_reset', '{}'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'state', v_state
  );
end
$function$;
