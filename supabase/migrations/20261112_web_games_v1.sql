-- Hry na veřejném webu: správci určují, které hry jsou na webu vidět.
--   hidden       = na webu se nezobrazí (výchozí)
--   coming_soon  = zobrazí se jako „Připravujeme“
--   listed       = zobrazí se jako dostupná hra

alter table public.games
  add column if not exists web_status text not null default 'hidden',
  add column if not exists web_purchase boolean not null default false,
  add column if not exists web_tagline text,
  add column if not exists web_description text,
  add column if not exists web_cover_url text,
  add column if not exists web_sort integer not null default 0;

alter table public.games drop constraint if exists games_web_status_check;
alter table public.games add constraint games_web_status_check
  check (web_status in ('hidden', 'coming_soon', 'listed'));

-- Spiknutí zůstává na webu, jak bylo (text je převzatý z dosavadní stránky).
update public.games
set web_status = 'listed',
    web_purchase = true,
    web_tagline = 'Odhalte, co se skrývá za známými místy.',
    web_description = 'Spiknutí vás zavede do pražských ulic, kde budete hledat skutečné detaily, pracovat s dokumenty a postupně odkrývat příběh, který se neodehrává na obrazovce, ale přímo před vámi.',
    web_sort = 1
where slug = 'spiknuti';

-- Veřejný seznam her pro web. Vrací jen hry označené jako „listed“ nebo „coming_soon“.
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
    'max_devices', g.max_devices
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
  where g.web_status in ('coming_soon', 'listed');
$$;

revoke all on function public.get_public_games() from public;
grant execute on function public.get_public_games() to anon, authenticated;
