# Backend (Supabase)

Projekt **Questplore Backend**, oblast `eu-west-1`. Přehrávač a administrace mluví přímo se Supabase.

## Obsah složky

| Složka | Co v ní je |
|---|---|
| `schema/01_tables_and_policies.sql` | Snímek tabulek, indexů, triggerů, pravidel přístupu (RLS) a úložišť |
| `schema/02_functions.sql` | Databázové funkce vytvořené před 12. 11. 2026 |
| `migrations/` | Pozdější změny v pořadí, v jakém se aplikovaly |
| `functions/` | Zdrojové kódy Edge Functions (kopie z produkce) |

Snímek schématu je **referenční export**, ne nástroj pro automatické nasazení. Při obnově projektu spusť nejdřív `01`, potom `02` a nakonec migrace podle data.

## Oprávnění

- Všechny tabulky mají zapnuté RLS. Číst a měnit je smějí jen správci (`is_admin()`).
- Hráči nemají účet. Chodí přes funkce s tajným tokenem relace (anonymní volání je povolené jen u těchto funkcí):
  `start_or_resume_game`, `get_session_game_content`, `get_session_progress`, `save_game_progress`,
  `reset_game_progress`, `log_game_event`, `submit_game_rating`.
- Funkce `admin_*`, `is_admin` a správa pozvánek smějí volat jen přihlášení uživatelé a každá navíc ověřuje `is_admin()`.

## Edge Functions

| Funkce | Přihlášení (verify_jwt) | Použití |
|---|---|---|
| `start-player-session` | ne | start hry z přehrávače |
| `upload-game-evidence` | ne | nahrání fotodůkazu |
| `get-game-evidence-url` | ne | dočasný odkaz na fotku hráče |
| `admin-invite` | ano | pozvánka správce e-mailem |
| `create-test-order`, `complete-test-order` | ne | **jen testovací nákup, před ostrým spuštěním nahradit platební bránou** |

Funkce bez přihlášení si ověřují token relace hráče uvnitř.

## Před ostrým spuštěním

- Odstranit `create-test-order` a `complete-test-order` (kdokoliv je může volat a získat herní kód zdarma).
- V Supabase Dashboardu smazat vyřazené vývojové funkce (vrací `410 Gone`).
- Zapnout ochranu proti uniklým heslům (Authentication → Policies, vyžaduje placený tarif).
