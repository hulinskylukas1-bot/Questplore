# CLAUDE.md – kontext projektu Questplore

Tento soubor je určený pro Clauda (AI asistenta) a pro každého, kdo na projektu začíná pracovat. Přečti ho celý, než cokoli změníš. Aktuální stav k **12. 11. 2026**.

## 1. Co je Questplore
Webová platforma pro **venkovní příběhové hry** (město jako herní plán, úkoly, GPS, fotodůkazy). Tým vyrazí s telefonem, hra ho vede skutečnou trasou. Hráč zadá **herní kód** (`HA-XXXX-XXXX`) a hraje v prohlížeči, nic neinstaluje.

- Hry:  **Spiknutí** (vydaná, Praha, 60–80 min) a **Praha 1757 – Kurýr z Lazaretu** (koncept, 90–110 min, ještě nikdo nehrál).
- Tvůrci her (nepíšou kód, dávají kreativní zadání): majitel projektu a jeho kolega. Majitel **není programátor**, vysvětluj lidsky a jednoduše, česky.
- Repozitář je **veřejný**: nikdy do něj nedávej hesla, tokeny, e-maily zákazníků ani správců.

## 2. Adresy a infrastruktura
| Co | Kde |
|---|---|
| Zákaznický web | https://hulinskylukas1-bot.github.io/Questplore/home.html |
| Hráčský přehrávač (zadání kódu) | https://hulinskylukas1-bot.github.io/Questplore/ |
| Administrace | https://hulinskylukas1-bot.github.io/Questplore/admin/ |
| Repozitář | https://github.com/hulinskylukas1-bot/Questplore (větev `main`) |
| Backend | Supabase, projekt **Questplore Backend**, id `hnhyscllpnyzbxhrffph`, oblast `eu-west-1` |

- **Hosting:** GitHub Pages. Každý push do `main` spustí workflow `.github/workflows/pages.yml` (kontrola syntaxe `app-*.js`, nasazení). Nasazení trvá ~30 s. Kontroluje se jen `app-*.js`, ne `site.js`, `home.js`, `game.js`, `voucher.js` ani `admin/index.html`.
- **Existuje jen jedna databáze (ostrá).** Žádné testovací prostředí. Změny v databázi jsou okamžitě živé. Testuj s dočasnými daty a po sobě je mazej (viz §7).
- Veřejný klíč Supabase (`sb_publishable_…`) je v kódu záměrně, zabezpečení stojí na RLS a funkcích v databázi.

## 3. Struktura repozitáře
```
index.html, app-core.js, app-ui1.js, app-ui2.js, styles.css   hráčský přehrávač (hra)
home.html/.css/.js, game.html/.js, voucher.html/.js, site.js  zákaznický web
purchase.html/.js/.css                                        testovací nákup (jen test!)
admin/index.html                                              administrace (jeden velký soubor, ~2100 řádků)
admin/preview.html                                            testovací náhled hry v adminu (starší kopie přehrávače)
brand/                                                        logo (SVG), návrhy, přehled
favicon.svg, og-image.png                                     ikona a obrázek pro sdílení odkazů
supabase/                                                     schéma, migrace, zálohy edge funkcí, README
commerce/README.md                                            poznámky k testovacímu nákupu
```
Žádný build, žádný framework, žádné `package.json`. Čisté HTML/CSS/JS. Na počítači **není Node**; syntaxi JS kontroluj přes JavaScriptCore (`/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc -e "new Function(read('soubor.js'))"`).

## 4. Architektura

### Přehrávač (`app-*.js`)
- Hráč zadá kód → edge funkce `start-player-session` vrátí obsah hry a relaci (`session_token`). Stav hry (`state`) se ukládá přes RPC `save_game_progress`, mezi zařízeními se synchronizuje dotazováním `get_session_progress` (~1× za sekundu).
- Bloky hry: narrator_message, instruction, document, image, text_answer, choice, quiz, sorting, logic_grid, gps, photo, confirm, conditional_message, draft_placeholder (nedokončené, hráči se nezobrazuje). Přechody mezi částmi (stages) řídí tabulka `transitions` (větvení podle volby).
- Funkce: časovač (běží od začátku do konce, **bez pauz**), nápovědy (zaznamenané), ukazatel vzdálenosti a směru k GPS cíli (volitelně u bloku, `show_guide`), záznam chybných pokusů (`log_game_event`), hodnocení na konci se souhlasem se zveřejněním, **limit 24 hodin** (po vypršení hra definitivně končí).
- Verze souborů se obchází cache přes `?v=NNN` v `index.html` (aktuálně `126`). **Při změně `app-*.js` nebo `styles.css` zvyš číslo.** Stejně `home.css?v=`, `site.js?v=`, `home.js?v=` ve stránkách webu.

### Administrace (`admin/index.html`)
Přihlášení přes Supabase Auth (e-mail + heslo), jen uživatelé z `admin_users`. Sekce (dlaždice na přehledu): Editor her (části, bloky, přechody, verze, publikace, mapa pro GPS, kontrola před vydáním), E-maily, **Recenze**, **Dárkové poukazy**, **Historie her**, **Hráči a herní kódy** (vč. testovacích kódů s označením TEST a odebráním, prodloužení hry), **Hry na webu**, Statistiky, Zákazníci, Administrátoři.

### Zákaznický web
- `home.html`: styl „složka případu“ (tmavé pozadí, papírové spisy, razítka, psací stroj, zlatý akcent `#e0b45c`, červená `#d9513a`), stopa (SVG čára, která se rozvíjí při posunu), cvičný úkol (skryté slovo STOPA), recenze (sekce se zobrazí jen se skutečnými daty), dárkový poukaz, časté otázky.
- `game.html?game=<slug>`: stránka hry (popis, galerie, recenze). `voucher.html`: objednávka poukazu.
- Všechna data (hry, recenze) jdou z veřejných RPC `get_public_games`, `get_public_game`, `get_public_reviews`. **Co je na webu, rozhoduje administrace** (karta Hry na webu): `games.web_status` = `hidden` / `coming_soon` / `listed`, `web_purchase`, slogan, popis, obrázek, galerie, pořadí.

### Backend (Supabase)
Podrobnosti v `supabase/README.md` a `supabase/schema/`. Klíčové:
- **Tabulky:** games, game_versions, game_translations, stages, blocks, block_translations, transitions, orders, licenses, game_sessions, session_devices, progress_events, evidence, customers, email_templates, promotions, admin_users, admin_invites, gift_requests.
- **RLS:** všechno jen pro správce (`is_admin()`). Hráči nemají účet, chodí přes funkce s tajným tokenem relace. Anonymně volatelné jsou jen: `start_or_resume_game`, `get_session_game_content`, `get_session_progress`, `save_game_progress`, `reset_game_progress`, `log_game_event`, `submit_game_rating`, `get_public_games`, `get_public_game`, `get_public_reviews`, `submit_gift_request`.
- **Testovací kód** = licence bez objednávky nebo z objednávky s `payment_provider='test'` (funkce `is_test_order`). Testy se nepočítají do recenzí a jdou odebrat.
- **Úložiště:** `game-assets` (veřejné: obrázky her, web), `game-evidence` (soukromé: fotodůkazy hráčů), `player-web`.
- **Edge funkce** (zdroj v `supabase/functions/`): `start-player-session`, `upload-game-evidence`, `get-game-evidence-url`, `admin-invite`, `create-test-order`, `complete-test-order`. Pozor: dvě vyřazené vývojové funkce `deploy-player-web-v06` a `evidence-test-v06` v Supabase **ještě existují** (smazat v Dashboardu).

## 5. Produktová pravidla a rozhodnutí (dodržuj)
- **Vykání** ve všech textech webu a hry. Jazyk uživatelských textů: čeština.
- **Žádné pauzy** ve hře, čas běží nepřetržitě. Po zadání kódu je **24 hodin** na dokončení, pak hra pro hráče **definitivně končí** (správce může výjimečně prodloužit). Poukaz platí **1 rok** od vydání, jakmile hra běží, platí 24h limit.
- Mobil první: web i hra musí fungovat na telefonu bez horizontálního posuvu.
- Dárkové poukazy: zákazník odešle objednávku (nic neplatí), správce po přijetí platby klikne **Vydat poukaz** → kód + tištěný poukaz. **Nepřidávej další místa, kde se rozdávají kódy zdarma.**
- Recenze: komentář se zveřejní jen s výslovným souhlasem hráče a po schválení správcem.
- Logo: lupa s pinem jako písmeno Q + „uestplore“, varianta C (červená tečka v „o“). Soubory `brand/questplore-logo.svg` (na tmavé), `questplore-logo-papir.svg` (na světlé). Zatím jen na webu, **ne** v přehrávači, administraci a na tištěném poukazu.
- Hráči i správce vidí pojem „spis/složka případu“ jako vizuální motiv, texty jsou konkrétní a bez vymyšlených faktů. **Nevymýšlej** obsah her, ceny, kontakty, recenze ani statistiky. U nedokončených úkolů (např. Herkules, Apollon) čeká zadání od autorů.

## 6. Jak spolupracovat s majitelem
- Mluv česky a lidsky, vyhýbej se žargonu; stručně řekni, co jsi změnil a co jsi ověřil. Poctivě odděl „ověřeno“ od „neověřeno“.
- **Commit a nasazení dělej až na výslovný pokyn** („Commitnout“, „Nasadit“). Vždy se předtím zeptej. Nasazení = sloučení do `main`.
- Navrhuj, rozhoduj pragmaticky, jedna doporučená varianta místo dlouhého výčtu.
- Majitel se do GitHubu přihlašuje přes svůj účet (`hulinskylukas1-bot`) v Safari, na Macu je uložený přístupový token pro `git push` (v klíčence, nikdy ho nevypisuj ani nehledej).

## 7. Pracovní postup (ověřený)
1. **Nová větev z aktuálního `main`:** `git fetch origin && git checkout -b <nazev> origin/main`, pak `git branch --unset-upstream` (jinak by push šel rovnou do `main`).
2. Změny, **lokální test**: `python3 -m http.server <port>` v kořeni repa a vestavěný prohlížeč (`mcp__Claude_Browser__*`). Pro stránky s daty z databáze použij mock `fetch`, nebo dočasná data v ostré databázi, která po testu **smaž** a ověř počty.
3. **Commit** s autorem `-c user.name=lukashulinsky -c user.email=…` (lokální git nemá nastavenou identitu) a s patičkou `Co-Authored-By: Claude …`. Do commitu nedávej `.DS_Store`.
4. **Push:** `Bash` nemá přihlášení k GitHubu. Použij **`run_in_terminal`** (Terminál uživatele, tam přihlášení funguje): `git push -u origin <nazev>`. Terminálových záložek může být najednou max. ~6, ukončuj je (`stop_terminal_tab` s `close: true`).
5. **Pull request a sloučení** ve vestavěném prohlížeči (uživatel je tam přihlášený na GitHubu): otevři `https://github.com/hulinskylukas1-bot/Questplore/pull/new/<nazev>`, klikni (přes JS) na „Create pull request“. Stránka často po kliknutí zůstane na formuláři a hlásí chybu, **PR se přesto vytvoří**: ověř v `/pulls`. Pak „Merge pull request“ → „Confirm merge“.
6. Po sloučení počkej (~30 s) a ověř živé soubory přes `curl` (a v prohlížeči s parametrem, např. `?v=2`, kvůli cache).
7. **Databázové změny:** `apply_migration` (Supabase MCP, projekt `hnhyscllpnyzbxhrffph`) **a zároveň** soubor do `supabase/migrations/RRRRMMDD_nazev.sql`. `execute_sql` vrací jen výsledek posledního příkazu. Edge funkci nasazuje `deploy_edge_function` (smazat funkci přes nástroje nejde) a zdroj aktualizuj v `supabase/functions/`.

### Záludnosti
- Vestavěný prohlížeč **blokuje nové záložky** (`target="_blank"`), proto jsou interní odkazy v administraci ve stejném okně.
- Bezpečnostní kontrola prostředí občas zablokuje nasazení do produkce, pokud nebylo výslovně schváleno v poslední zprávě. Pak se zastav a zeptej se uživatele.
- GitHub Pages cachuje; po změně JS/CSS zvyš `?v=`.
- Nepoužívej `sleep` ve smyčkách delších než krátké čekání; na nasazení stačí smyčka s `curl` a `sleep 5`.
- SVG → PNG na Macu: `qlmanage -t -s <px> -o <složka> soubor.svg` (výstup je čtverec, pro jiný poměr ořízni přes `sips -c <výška> <šířka>`).

## 8. Stav a otevřené úkoly (podle priority)
**Hry (kreativní část majitele a kolegy):**
1. Dodělat **konec hry Spiknutí** (termín: do konce týdne od 12. 11.). Čeká na zadání: poslední úkol, závěrečné odhalení, obrazovka po dohrání.
2. Doplnit **souřadnice GPS bodů**: „Malostranské náměstí / MFF“ a „Krápníková stěna“ (jinak hráč projde bez ověření polohy). Nástroj: Vybrat na mapě v editoru bloku.
3. Doplnit nedokončené úkoly **Herkules** a **Apollon / archiv** (zadání od autorů).
4. Rádius pod 20 m u „Můstek v Thunovské“ a „Milada Horáková“ zvětšit.
5. **Praha 1757** projít (Zkontrolovat hru), vydat a vyzkoušet v terénu. Spiknutí vyzkoušet celé na telefonu (časovač, ukazatel směru, chyby, hodnocení, fotky).
6. **Spiknutí je teď na webu nastavené jako „Skrytá“** (rozhodnutí majitele při zkoušení). Zveřejnění: Administrace → Hry na webu → Zveřejněná. Pak doplnit text a fotografie (Text a obrázek).
7. Bodový systém her: sloupec `game_sessions.score` a sloupec v historii jsou připravené, pravidla vymyslí majitel.

**Příprava na ostrý provoz:**
8. **Platební brána** (Stripe/GoPay), IČO, obchodní podmínky, ochrana osobních údajů, e-mail se zasíláním kódu (e-mailový provider; tabulka `email_templates` je prázdná). Právní texty zatím na webu chybí.
9. **Vypnout `create-test-order` a `complete-test-order`**: veřejně rozdávají herní kódy zdarma (stránka „Koupit hru“ je jen test). Do spuštění nahradit platbou.
10. Smazat v Supabase Dashboardu vyřazené funkce `deploy-player-web-v06`, `evidence-test-v06`. Zapnout ochranu proti uniklým heslům (Auth → Email, vyžaduje placený tarif).
11. Ověřit na ostro **tištěný poukaz** (datum platnosti) při první objednávce poukazu.
12. Přidat logo do přehrávače, administrace a na tištěný poukaz.

**Nápady, které nejsou rozhodnuté:** režim pro slabý signál (předem stáhnout etapu), zvuk/vibrace, živý přehled týmů v administraci, ověření ochranné známky Questplore, ukazatel směru a časovač v testovacím náhledu administrace (`admin/preview.html`).

## 9. Rychlý start v nové konverzaci
1. Přečti tento soubor a `supabase/README.md`.
2. `git status`, `git branch --show-current`, `git log --oneline -5` (jsi na `main`? jsou rozdělané větve?).
3. Zeptej se uživatele, na čem dnes pracujete, a ověř, že se nic nerozbilo: otevři živý web a administraci ve vestavěném prohlížeči.
4. Pokud potřebuješ stav databáze: `list_tables`, `get_advisors` (Supabase MCP).
