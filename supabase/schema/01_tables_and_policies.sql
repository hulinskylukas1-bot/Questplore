-- Questplore – snímek schématu databáze (stav k 12. 11. 2026).
-- Referenční export pro obnovu projektu. Pořadí: tabulky → indexy → triggery → pravidla přístupu → úložiště.
-- Funkce jsou v 02_functions.sql. Pozdější změny jsou v supabase/migrations/.

create table public.games (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  city text,
  status text not null default 'draft'::text,
  min_players integer,
  max_players integer,
  max_devices integer default 1,
  default_locale text not null default 'cs'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  estimated_duration_min integer,
  estimated_duration_max integer,
  constraint games_slug_key UNIQUE (slug),
  constraint games_pkey PRIMARY KEY (id),
  constraint games_duration_max_valid CHECK (((estimated_duration_max IS NULL) OR (estimated_duration_max >= 0))),
  constraint games_duration_min_nonnegative CHECK (((estimated_duration_min IS NULL) OR (estimated_duration_min >= 0))),
  constraint games_duration_order_valid CHECK (((estimated_duration_min IS NULL) OR (estimated_duration_max IS NULL) OR (estimated_duration_max >= estimated_duration_min))),
  constraint games_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);
alter table public.games enable row level security;

create table public.game_versions (
  id uuid not null default gen_random_uuid(),
  game_id uuid not null,
  version_number integer not null,
  status text not null default 'draft'::text,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint game_versions_game_id_version_number_key UNIQUE (game_id, version_number),
  constraint game_versions_pkey PRIMARY KEY (id),
  constraint game_versions_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  constraint game_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);
alter table public.game_versions enable row level security;

create table public.game_translations (
  id uuid not null default gen_random_uuid(),
  game_version_id uuid not null,
  locale text not null,
  title text not null,
  description text,
  constraint game_translations_game_version_id_locale_key UNIQUE (game_version_id, locale),
  constraint game_translations_pkey PRIMARY KEY (id),
  constraint game_translations_game_version_id_fkey FOREIGN KEY (game_version_id) REFERENCES game_versions(id) ON DELETE CASCADE
);
alter table public.game_translations enable row level security;

create table public.stages (
  id uuid not null default gen_random_uuid(),
  game_version_id uuid not null,
  internal_name text not null,
  internal_note text,
  "position" integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint stages_pkey PRIMARY KEY (id),
  constraint stages_game_version_id_fkey FOREIGN KEY (game_version_id) REFERENCES game_versions(id) ON DELETE CASCADE
);
alter table public.stages enable row level security;

create table public.blocks (
  id uuid not null default gen_random_uuid(),
  stage_id uuid not null,
  block_type text not null,
  "position" integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint blocks_pkey PRIMARY KEY (id),
  constraint blocks_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE
);
alter table public.blocks enable row level security;

create table public.block_translations (
  id uuid not null default gen_random_uuid(),
  block_id uuid not null,
  locale text not null,
  content jsonb not null default '{}'::jsonb,
  constraint block_translations_block_id_locale_key UNIQUE (block_id, locale),
  constraint block_translations_pkey PRIMARY KEY (id),
  constraint block_translations_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE
);
alter table public.block_translations enable row level security;

create table public.transitions (
  id uuid not null default gen_random_uuid(),
  game_version_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid,
  condition jsonb not null default '{}'::jsonb,
  priority integer not null default 0,
  constraint transitions_pkey PRIMARY KEY (id),
  constraint transitions_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES stages(id) ON DELETE CASCADE,
  constraint transitions_game_version_id_fkey FOREIGN KEY (game_version_id) REFERENCES game_versions(id) ON DELETE CASCADE,
  constraint transitions_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES stages(id) ON DELETE CASCADE
);
alter table public.transitions enable row level security;

create table public.orders (
  id uuid not null default gen_random_uuid(),
  email text not null,
  status text not null default 'pending'::text,
  amount integer,
  currency text default 'CZK'::text,
  created_at timestamp with time zone not null default now(),
  game_id uuid,
  payment_provider text,
  provider_payment_id text,
  provider_checkout_id text,
  paid_at timestamp with time zone,
  customer_name text,
  metadata jsonb not null default '{}'::jsonb,
  fulfilled_at timestamp with time zone,
  constraint orders_pkey PRIMARY KEY (id),
  constraint orders_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id),
  constraint orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text, 'refunded'::text])))
);
alter table public.orders enable row level security;

create table public.licenses (
  id uuid not null default gen_random_uuid(),
  game_id uuid not null,
  order_id uuid,
  code text not null,
  status text not null default 'unused'::text,
  activated_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint licenses_code_key UNIQUE (code),
  constraint licenses_pkey PRIMARY KEY (id),
  constraint licenses_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id),
  constraint licenses_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id),
  constraint licenses_status_check CHECK ((status = ANY (ARRAY['unused'::text, 'active'::text, 'completed'::text, 'revoked'::text])))
);
alter table public.licenses enable row level security;

create table public.game_sessions (
  id uuid not null default gen_random_uuid(),
  license_id uuid not null,
  game_version_id uuid not null,
  current_stage_id uuid,
  status text not null default 'active'::text,
  started_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  current_block_id uuid,
  state jsonb not null default '{}'::jsonb,
  session_token uuid not null default gen_random_uuid(),
  state_revision bigint not null default 0,
  state_updated_at timestamp with time zone not null default now(),
  score integer,
  rating smallint,
  rating_comment text,
  rated_at timestamp with time zone,
  constraint game_sessions_pkey PRIMARY KEY (id),
  constraint game_sessions_session_token_key UNIQUE (session_token),
  constraint game_sessions_current_block_id_fkey FOREIGN KEY (current_block_id) REFERENCES blocks(id) ON DELETE SET NULL,
  constraint game_sessions_current_stage_id_fkey FOREIGN KEY (current_stage_id) REFERENCES stages(id),
  constraint game_sessions_game_version_id_fkey FOREIGN KEY (game_version_id) REFERENCES game_versions(id),
  constraint game_sessions_license_id_fkey FOREIGN KEY (license_id) REFERENCES licenses(id),
  constraint game_sessions_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
  constraint game_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'abandoned'::text])))
);
alter table public.game_sessions enable row level security;

create table public.session_devices (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  device_token uuid not null default gen_random_uuid(),
  device_name text,
  joined_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  constraint session_devices_session_id_device_token_key UNIQUE (session_id, device_token),
  constraint session_devices_pkey PRIMARY KEY (id),
  constraint session_devices_session_id_fkey FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);
alter table public.session_devices enable row level security;

create table public.progress_events (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  stage_id uuid,
  block_id uuid,
  device_id uuid,
  event_type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint progress_events_pkey PRIMARY KEY (id),
  constraint progress_events_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks(id),
  constraint progress_events_device_id_fkey FOREIGN KEY (device_id) REFERENCES session_devices(id),
  constraint progress_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
  constraint progress_events_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES stages(id)
);
alter table public.progress_events enable row level security;

create table public.evidence (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  stage_id uuid,
  block_id uuid,
  evidence_type text not null,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint evidence_pkey PRIMARY KEY (id),
  constraint evidence_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks(id),
  constraint evidence_session_id_fkey FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
  constraint evidence_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES stages(id)
);
alter table public.evidence enable row level security;

create table public.promotions (
  id uuid not null default gen_random_uuid(),
  code text,
  name text not null,
  promotion_type text not null,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  valid_from timestamp with time zone,
  valid_until timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint promotions_code_key UNIQUE (code),
  constraint promotions_pkey PRIMARY KEY (id)
);
alter table public.promotions enable row level security;

create table public.customers (
  id uuid not null default gen_random_uuid(),
  email text,
  name text,
  phone text,
  note text,
  source text not null default 'admin'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint customers_pkey PRIMARY KEY (id)
);
alter table public.customers enable row level security;

create table public.email_templates (
  id uuid not null default gen_random_uuid(),
  internal_name text not null,
  template_key text not null,
  locale text not null default 'cs'::text,
  subject text not null default ''::text,
  body text not null default ''::text,
  status text not null default 'draft'::text,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint email_templates_template_key_key UNIQUE (template_key),
  constraint email_templates_pkey PRIMARY KEY (id),
  constraint email_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text])))
);
alter table public.email_templates enable row level security;

create table public.admin_users (
  user_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint admin_users_pkey PRIMARY KEY (user_id),
  constraint admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.admin_users enable row level security;

-- Bez pravidel (záměrně): přístup jen přes funkce.
create table public.admin_invites (
  id uuid not null default gen_random_uuid(),
  email text not null,
  token uuid not null default gen_random_uuid(),
  expires_at timestamp with time zone not null default (now() + '14 days'::interval),
  claimed_by uuid,
  claimed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  invited_user_id uuid,
  cancelled_at timestamp with time zone,
  constraint admin_invites_token_key UNIQUE (token),
  constraint admin_invites_pkey PRIMARY KEY (id)
);
alter table public.admin_invites enable row level security;

-- Indexy
CREATE INDEX idx_blocks_stage ON public.blocks USING btree (stage_id);
CREATE UNIQUE INDEX customers_email_lower_unique ON public.customers USING btree (lower(email)) WHERE ((email IS NOT NULL) AND (btrim(email) <> ''::text));
CREATE INDEX idx_evidence_session ON public.evidence USING btree (session_id);
CREATE INDEX idx_sessions_license ON public.game_sessions USING btree (license_id);
CREATE INDEX idx_game_versions_game ON public.game_versions USING btree (game_id);
CREATE INDEX licenses_order_id_idx ON public.licenses USING btree (order_id);
CREATE INDEX orders_email_idx ON public.orders USING btree (lower(email));
CREATE INDEX orders_game_id_idx ON public.orders USING btree (game_id);
CREATE UNIQUE INDEX orders_provider_checkout_uidx ON public.orders USING btree (payment_provider, provider_checkout_id) WHERE (provider_checkout_id IS NOT NULL);
CREATE UNIQUE INDEX orders_provider_payment_uidx ON public.orders USING btree (payment_provider, provider_payment_id) WHERE (provider_payment_id IS NOT NULL);
CREATE INDEX orders_status_idx ON public.orders USING btree (status);
CREATE INDEX idx_progress_created ON public.progress_events USING btree (created_at);
CREATE INDEX idx_progress_session ON public.progress_events USING btree (session_id);
CREATE INDEX idx_stages_version ON public.stages USING btree (game_version_id);

-- Triggery
CREATE TRIGGER set_customer_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION set_customer_updated_at();
CREATE TRIGGER set_email_template_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION set_email_template_updated_at();
CREATE TRIGGER games_set_updated_at BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_mark_session_completed AFTER INSERT ON public.progress_events FOR EACH ROW EXECUTE FUNCTION mark_session_completed();

-- Pravidla přístupu (RLS): všechna data jsou přístupná jen správcům. Hráči chodí přes funkce s tokenem.
create policy ha_admin_select_admin_users on public.admin_users for SELECT to authenticated using (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_block_translations on public.block_translations for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_blocks on public.blocks for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "Admins can delete customers" on public.customers for DELETE to authenticated using (is_admin());
create policy "Admins can insert customers" on public.customers for INSERT to authenticated with check (is_admin());
create policy "Admins can update customers" on public.customers for UPDATE to authenticated using (is_admin()) with check (is_admin());
create policy "Admins can view customers" on public.customers for SELECT to authenticated using (is_admin());
create policy "Admins can delete email templates" on public.email_templates for DELETE to authenticated using (is_admin());
create policy "Admins can insert email templates" on public.email_templates for INSERT to authenticated with check (is_admin());
create policy "Admins can update email templates" on public.email_templates for UPDATE to authenticated using (is_admin()) with check (is_admin());
create policy "Admins can view email templates" on public.email_templates for SELECT to authenticated using (is_admin());
create policy ha_admin_all_evidence on public.evidence for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_game_sessions on public.game_sessions for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_game_translations on public.game_translations for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_game_versions on public.game_versions for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_games on public.games for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_licenses on public.licenses for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_orders on public.orders for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_progress_events on public.progress_events for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_promotions on public.promotions for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_session_devices on public.session_devices for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_stages on public.stages for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy ha_admin_all_transitions on public.transitions for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));

-- Úložiště (storage)
insert into storage.buckets (id, name, public) values ('game-assets', 'game-assets', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('game-evidence', 'game-evidence', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('player-web', 'player-web', true) on conflict (id) do nothing;

create policy questplore_admin_game_assets_delete on storage.objects for DELETE to authenticated using (((bucket_id = 'game-assets'::text) AND is_admin()));
create policy questplore_admin_game_assets_insert on storage.objects for INSERT to authenticated with check (((bucket_id = 'game-assets'::text) AND is_admin()));
create policy questplore_admin_game_assets_select on storage.objects for SELECT to authenticated using (((bucket_id = 'game-assets'::text) AND is_admin()));
create policy questplore_admin_game_assets_update on storage.objects for UPDATE to authenticated using (((bucket_id = 'game-assets'::text) AND is_admin())) with check (((bucket_id = 'game-assets'::text) AND is_admin()));
create policy questplore_admin_game_evidence_delete on storage.objects for DELETE to authenticated using (((bucket_id = 'game-evidence'::text) AND is_admin()));
create policy questplore_admin_game_evidence_select on storage.objects for SELECT to authenticated using (((bucket_id = 'game-evidence'::text) AND is_admin()));
