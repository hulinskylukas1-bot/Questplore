# Questplore – commerce test flow

Aktuální stav bez IČO a bez ostré platební brány:

1. `purchase.html` vytvoří testovací objednávku.
2. Backend uloží e-mail, volitelné jméno a hru Spiknutí.
3. Tlačítko „Simulovat úspěšnou platbu“ označí pouze TEST objednávku jako zaplacenou.
4. Backend vydá unikátní licenci ve formátu `HA-XXXX-XXXX`.
5. Stejná objednávka nevydá při opakovaném potvrzení druhý kód.
6. Kód je okamžitě použitelný v Playeru.

## Co se pouze doplní po získání podnikatelských údajů

- vybraný poskytovatel plateb (Stripe / GoPay),
- merchant účet a produkční klíče uložené pouze jako serverové secrets,
- finální cena a měna,
- ostrý checkout místo testovacího tlačítka,
- webhook platební brány, který po ověřené platbě zavolá stejnou logiku pro vydání licence,
- e-mailový provider a odeslání kódu,
- fakturační údaje, obchodní podmínky, ochrana osobních údajů a reklamační/odstupovací informace.

## Bezpečnost

Funkce pro vytvoření a dokončení testovací objednávky nejsou dostupné přímo přes veřejné databázové RPC. Veřejná stránka komunikuje pouze s Edge Functions. Testovací dokončení odmítne objednávku, která není označena jako `payment_provider=test` a `environment=test`.

## E-mail po zaplacení – zamýšlený obsah

Předmět: Questplore – váš kód ke hře Spiknutí

Děkujeme za objednávku hry Spiknutí.

Váš herní kód:
{{LICENSE_CODE}}

Hru spustíte na:
https://hulinskylukas1-bot.github.io/Questplore/

Kód si uschovejte. Umožňuje návrat do rozehrané hry.
