-- Stránky her, veřejné recenze a dárkové poukazy.

-- ===== Stránka hry: podrobný popis a galerie =====
alter table public.games
  add column if not exists web_details text,
  add column if not exists web_gallery jsonb not null default '[]'::jsonb;

-- ===== Recenze: souhlas hráče a schválení správcem =====
alter table public.game_sessions
  add column if not exists rating_consent boolean not null default false,
  add column if not exists rating_public boolean not null default false;

drop function if exists public.submit_game_rating(uuid, uuid, integer, text);
create or replace function public.submit_game_rating(
  p_session_token uuid, p_device_token uuid, p_rating integer,
  p_comment text default null, p_consent boolean default false)
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
      rating_consent = coalesce(p_consent, false),
      rating_public = false,
      rated_at = now()
  where id = v_session;

  insert into public.progress_events(session_id, device_id, event_type, data)
  values (v_session, v_device, 'rating_submitted', jsonb_build_object('rating', p_rating));

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.submit_game_rating(uuid, uuid, integer, text, boolean) from public;
grant execute on function public.submit_game_rating(uuid, uuid, integer, text, boolean) to anon, authenticated;

-- Veřejné recenze (jen schválené a se souhlasem; testovací kódy se nepočítají).
create or replace function public.get_public_reviews(p_slug text default null, p_limit integer default 12)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with base as (
    select s.rating, s.rating_comment, s.rated_at, s.rating_consent, s.rating_public,
           g.name as game_name, g.slug as game_slug
    from public.game_sessions s
    join public.licenses l on l.id = s.license_id
    join public.game_versions v on v.id = s.game_version_id
    join public.games g on g.id = v.game_id
    where s.rating is not null
      and not public.is_test_order(l.order_id)
      and g.web_status in ('coming_soon', 'listed')
      and (p_slug is null or g.slug = p_slug)
  )
  select jsonb_build_object(
    'avg', (select round(avg(rating)::numeric, 1) from base),
    'count', (select count(*) from base),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating', r.rating, 'comment', r.rating_comment, 'date', r.rated_at,
        'game_name', r.game_name, 'game_slug', r.game_slug) order by r.rated_at desc)
      from (
        select * from base
        where rating_public and rating_consent and coalesce(trim(rating_comment), '') <> ''
        order by rated_at desc
        limit greatest(1, least(coalesce(p_limit, 12), 50))
      ) r
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.get_public_reviews(text, integer) from public;
grant execute on function public.get_public_reviews(text, integer) to anon, authenticated;

-- Správa recenzí v administraci.
create or replace function public.admin_list_reviews()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return coalesce((
    select jsonb_agg(r order by r.rated_at desc) from (
      select s.id as session_id, g.name as game_name, s.rating, s.rating_comment as comment,
             s.rated_at, s.rating_consent as consent, s.rating_public as is_public,
             public.is_test_order(l.order_id) as is_test, o.email
      from public.game_sessions s
      join public.licenses l on l.id = s.license_id
      join public.game_versions v on v.id = s.game_version_id
      join public.games g on g.id = v.game_id
      left join public.orders o on o.id = l.order_id
      where s.rating is not null
      order by s.rated_at desc
      limit 500
    ) r
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_review_public(p_session_id uuid, p_public boolean)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v public.game_sessions%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v from public.game_sessions where id = p_session_id for update;
  if v.id is null then raise exception 'REVIEW_NOT_FOUND'; end if;
  if p_public and (not v.rating_consent or coalesce(trim(v.rating_comment), '') = '') then
    raise exception 'NO_CONSENT_OR_COMMENT';
  end if;
  update public.game_sessions set rating_public = p_public where id = p_session_id;
  return p_public;
end $$;

revoke all on function public.admin_list_reviews() from public, anon, authenticated;
revoke all on function public.admin_set_review_public(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_list_reviews() to authenticated;
grant execute on function public.admin_set_review_public(uuid, boolean) to authenticated;

-- ===== Veřejné hry: hodnocení + stránka hry =====
create or replace function public.get_public_games()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', g.slug,
    'name', coalesce(t.title, g.name),
    'city', g.city,
    'status', g.web_status,
    'purchase', (g.web_purchase and g.web_status = 'listed'
                 and exists (select 1 from public.game_versions v where v.game_id = g.id and v.status = 'published')),
    'tagline', g.web_tagline,
    'description', coalesce(nullif(g.web_description, ''), t.description),
    'cover_url', g.web_cover_url,
    'duration_min', g.estimated_duration_min,
    'duration_max', g.estimated_duration_max,
    'min_players', g.min_players,
    'max_players', g.max_players,
    'max_devices', g.max_devices,
    'rating_avg', rs.avg_rating,
    'rating_count', coalesce(rs.cnt, 0)
  ) order by g.web_sort, g.created_at), '[]'::jsonb)
  from public.games g
  left join lateral (
    select gt.title, gt.description
    from public.game_translations gt
    join public.game_versions gv on gv.id = gt.game_version_id
    where gv.game_id = g.id and gt.locale = g.default_locale
    order by (gv.status = 'published') desc, gv.version_number desc
    limit 1
  ) t on true
  left join lateral (
    select round(avg(s.rating)::numeric, 1) as avg_rating, count(*) as cnt
    from public.game_sessions s
    join public.licenses l on l.id = s.license_id
    join public.game_versions v on v.id = s.game_version_id
    where v.game_id = g.id and s.rating is not null and not public.is_test_order(l.order_id)
  ) rs on true
  where g.web_status in ('coming_soon', 'listed');
$$;

create or replace function public.get_public_game(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'slug', g.slug,
    'name', coalesce(t.title, g.name),
    'city', g.city,
    'status', g.web_status,
    'purchase', (g.web_purchase and g.web_status = 'listed'
                 and exists (select 1 from public.game_versions v where v.game_id = g.id and v.status = 'published')),
    'tagline', g.web_tagline,
    'description', coalesce(nullif(g.web_description, ''), t.description),
    'details', g.web_details,
    'gallery', g.web_gallery,
    'cover_url', g.web_cover_url,
    'duration_min', g.estimated_duration_min,
    'duration_max', g.estimated_duration_max,
    'min_players', g.min_players,
    'max_players', g.max_players,
    'max_devices', g.max_devices
  )
  from public.games g
  left join lateral (
    select gt.title, gt.description
    from public.game_translations gt
    join public.game_versions gv on gv.id = gt.game_version_id
    where gv.game_id = g.id and gt.locale = g.default_locale
    order by (gv.status = 'published') desc, gv.version_number desc
    limit 1
  ) t on true
  where g.slug = p_slug and g.web_status in ('coming_soon', 'listed');
$$;
revoke all on function public.get_public_game(text) from public;
grant execute on function public.get_public_game(text) to anon, authenticated;

-- ===== Dárkové poukazy: objednávka z webu, vydání v administraci =====
create table if not exists public.gift_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  game_id uuid not null references public.games(id),
  buyer_name text not null,
  buyer_email text not null,
  recipient_name text,
  message text,
  status text not null default 'new' check (status in ('new', 'paid', 'issued', 'cancelled')),
  license_id uuid references public.licenses(id),
  issued_at timestamptz,
  admin_note text
);
alter table public.gift_requests enable row level security;
drop policy if exists ha_admin_all_gift_requests on public.gift_requests;
create policy ha_admin_all_gift_requests on public.gift_requests
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.submit_gift_request(
  p_game_slug text, p_buyer_name text, p_buyer_email text,
  p_recipient_name text default null, p_message text default null, p_website text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_game uuid;
  v_email text := lower(trim(coalesce(p_buyer_email, '')));
begin
  -- Past na roboty: vyplněné skryté pole znamená spam, tiše zahodíme.
  if coalesce(p_website, '') <> '' then return jsonb_build_object('ok', true); end if;

  if length(trim(coalesce(p_buyer_name, ''))) < 2 or length(p_buyer_name) > 100 then raise exception 'INVALID_NAME'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'INVALID_EMAIL'; end if;
  if length(coalesce(p_recipient_name, '')) > 100 then raise exception 'INVALID_RECIPIENT'; end if;
  if length(coalesce(p_message, '')) > 500 then raise exception 'MESSAGE_TOO_LONG'; end if;

  select g.id into v_game from public.games g
  where g.slug = p_game_slug and g.web_status = 'listed' and g.web_purchase
    and exists (select 1 from public.game_versions v where v.game_id = g.id and v.status = 'published');
  if v_game is null then raise exception 'GAME_NOT_AVAILABLE'; end if;

  if (select count(*) from public.gift_requests where lower(buyer_email) = v_email and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.gift_requests where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;

  insert into public.gift_requests(game_id, buyer_name, buyer_email, recipient_name, message)
  values (v_game, trim(p_buyer_name), v_email,
          nullif(trim(coalesce(p_recipient_name, '')), ''), nullif(trim(coalesce(p_message, '')), ''));

  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.submit_gift_request(text, text, text, text, text, text) from public;
grant execute on function public.submit_gift_request(text, text, text, text, text, text) to anon, authenticated;

-- Vydání poukazu: vytvoří zaplacenou (ruční) objednávku a licenci. Poukaz se tak chová jako běžný kód.
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

  update public.orders set fulfilled_at = now() where id = v_order.id;
  update public.gift_requests
  set status = 'issued', license_id = v_license.id, issued_at = now()
  where id = r.id;

  return jsonb_build_object('ok', true, 'code', v_license.code, 'license_id', v_license.id);
end $$;
revoke all on function public.admin_issue_gift_voucher(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_issue_gift_voucher(uuid, integer) to authenticated;
