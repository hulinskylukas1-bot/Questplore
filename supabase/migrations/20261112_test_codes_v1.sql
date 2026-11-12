-- Testovací kódy a hry: jednoznačné označení a možnost kdykoliv je odebrat.
-- Za testovací se považuje kód bez objednávky (vydaný z administrace) nebo z testovací objednávky.

create or replace function public.is_test_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_order_id is null
      or exists (select 1 from public.orders o
                 where o.id = p_order_id
                   and (o.payment_provider = 'test' or o.metadata ->> 'environment' = 'test'));
$$;
revoke all on function public.is_test_order(uuid) from public, anon, authenticated;

-- Správci smějí mazat soubory fotodůkazů (při odebrání testovací hry).
drop policy if exists questplore_admin_game_evidence_delete on storage.objects;
create policy questplore_admin_game_evidence_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'game-evidence' and public.is_admin());

-- Seznam testovacích kódů a her.
create or replace function public.admin_list_test_licenses()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  return coalesce((
    select jsonb_agg(r order by r.created_at desc) from (
      select
        l.id as license_id,
        l.code,
        l.status as license_status,
        l.created_at,
        g.name as game_name,
        (l.order_id is null) as admin_issued,
        o.email,
        s.id as session_id,
        s.status as session_status,
        s.started_at,
        s.state_updated_at as last_activity,
        (select st.internal_name from public.stages st where st.id = s.current_stage_id) as stage_name,
        (select st.position from public.stages st where st.id = s.current_stage_id) as stage_position,
        (select count(*) from public.stages st where st.game_version_id = s.game_version_id) as stages_total,
        coalesce(nullif(s.state ->> 'finishedSec', '')::numeric, nullif(s.state ->> 'elapsedSec', '')::numeric) as duration_sec,
        (select count(*) from public.session_devices d where d.session_id = s.id) as devices_count,
        (select count(*) from public.progress_events e where e.session_id = s.id) as events_count
      from public.licenses l
      join public.games g on g.id = l.game_id
      left join public.orders o on o.id = l.order_id
      left join lateral (
        select * from public.game_sessions gs where gs.license_id = l.id order by gs.started_at desc limit 1
      ) s on true
      where public.is_test_order(l.order_id)
    ) r
  ), '[]'::jsonb);
end $$;

-- Odebrání testovacího kódu včetně rozehraných dat. Reálné kódy odmítne.
create or replace function public.admin_delete_test_license(p_license_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order uuid;
  v_paths jsonb := '[]'::jsonb;
  v_sessions uuid[];
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select order_id into v_order from public.licenses where id = p_license_id;
  if not found then raise exception 'LICENSE_NOT_FOUND'; end if;
  if not public.is_test_order(v_order) then raise exception 'NOT_A_TEST_LICENSE'; end if;

  select coalesce(array_agg(id), '{}') into v_sessions from public.game_sessions where license_id = p_license_id;

  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into v_paths
  from public.evidence where session_id = any(v_sessions) and storage_path is not null;

  delete from public.progress_events where session_id = any(v_sessions);
  delete from public.evidence where session_id = any(v_sessions);
  delete from public.session_devices where session_id = any(v_sessions);
  delete from public.game_sessions where id = any(v_sessions);
  delete from public.licenses where id = p_license_id;

  -- Testovací objednávka bez dalších kódů se odebere také.
  if v_order is not null and not exists (select 1 from public.licenses where order_id = v_order) then
    delete from public.orders where id = v_order;
  end if;

  return jsonb_build_object('ok', true, 'storage_paths', v_paths);
end $$;

revoke all on function public.admin_list_test_licenses() from public, anon, authenticated;
revoke all on function public.admin_delete_test_license(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_test_licenses() to authenticated;
grant execute on function public.admin_delete_test_license(uuid) to authenticated;
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
