# Questplore

Webová platforma pro **venkovní příběhové hry**. Tým vyrazí s telefonem do města, hledá skutečné stopy, řeší úkoly, ověřuje polohu a fotografuje důkazy. Hra se hraje v prohlížeči po zadání herního kódu, nic se neinstaluje.

- **Web:** https://hulinskylukas1-bot.github.io/Questplore/home.html
- **Hráč (zadání kódu):** https://hulinskylukas1-bot.github.io/Questplore/
- **Administrace:** https://hulinskylukas1-bot.github.io/Questplore/admin/

## Z čeho se projekt skládá
| Část | Soubory | Popis |
|---|---|---|
| Přehrávač hry | `index.html`, `app-*.js`, `styles.css` | Hra pro hráče: úkoly, GPS, fotky, nápovědy, časovač, hodnocení. |
| Zákaznický web | `home.*`, `game.*`, `voucher.*`, `site.js` | Úvodní stránka, stránka každé hry, objednávka dárkového poukazu. Obsah řídí administrace. |
| Administrace | `admin/` | Editor her, historie, recenze, poukazy, hráči a kódy, hry na webu, statistiky. |
| Backend | `supabase/` | Schéma databáze, migrace, edge funkce (Supabase). |
| Logo | `brand/`, `favicon.svg`, `og-image.png` | Logo ve vektoru a podklady. |

Čisté HTML, CSS a JavaScript, bez frameworku a bez sestavování. Data a přihlášení zajišťuje Supabase, hostuje GitHub Pages.

## Spuštění lokálně
Stačí statický server v kořeni repozitáře:

```bash
python3 -m http.server 8000
```

Pak otevři `http://localhost:8000/home.html` (web), `http://localhost:8000/` (hra) nebo `http://localhost:8000/admin/` (administrace). Aplikace komunikují s ostrým Supabase projektem, **existuje jen jedna databáze**, proto při zkoušení používej testovací kódy a po sobě je odebírej (administrace → Hráči a kódy).

## Nasazení
Každý push do větve `main` spustí GitHub Actions (`.github/workflows/pages.yml`), zkontroluje syntaxi přehrávače a nasadí web na GitHub Pages. Změny se dělají ve větvích a slučují přes pull request. Databázové změny jsou v `supabase/migrations/`.

## Další dokumentace
- [`CLAUDE.md`](CLAUDE.md): podrobný kontext projektu, pravidla, pracovní postup a seznam otevřených úkolů.
- [`supabase/README.md`](supabase/README.md): backend, oprávnění, edge funkce, časové limity.
- [`commerce/README.md`](commerce/README.md): poznámky k nákupu (zatím jen testovací režim).
