// Questplore – objednávka dárkového poukazu. Objednávka se uloží a vyřizuje se v administraci.
const gGame = document.getElementById('gGame');
const gMsg = document.getElementById('gMsg');
const gSubmit = document.getElementById('gSubmit');
const preselect = new URLSearchParams(location.search).get('game') || '';

const ERRORS = {
  INVALID_NAME: 'Zadejte prosím své jméno.',
  INVALID_EMAIL: 'Zadejte prosím platný e-mail.',
  INVALID_RECIPIENT: 'Jméno obdarovaného je příliš dlouhé.',
  MESSAGE_TOO_LONG: 'Vzkaz může mít nejvýše 500 znaků.',
  GAME_NOT_AVAILABLE: 'Tuto hru teď nelze objednat jako poukaz. Vyberte jinou.',
  TOO_MANY_REQUESTS: 'Odeslali jste příliš mnoho objednávek. Zkuste to prosím později.'
};

(async function loadGames() {
  try {
    const games = await rpc('get_public_games', {});
    const buyable = (games || []).filter(g => g.purchase);
    gGame.replaceChildren();
    if (!buyable.length) {
      gGame.appendChild(new Option('Poukazy zatím nejsou k dispozici', ''));
      gGame.disabled = true;
      gSubmit.disabled = true;
      gMsg.textContent = 'Dárkové poukazy právě připravujeme. Zkuste to prosím za chvíli.';
      return;
    }
    gGame.appendChild(new Option('Vyberte hru…', ''));
    buyable.forEach(g => gGame.appendChild(new Option(g.name, g.slug)));
    if (preselect && buyable.some(g => g.slug === preselect)) gGame.value = preselect;
    else if (buyable.length === 1) gGame.value = buyable[0].slug;
  } catch (e) {
    gGame.replaceChildren(new Option('Hry se nepodařilo načíst', ''));
    gMsg.textContent = 'Hry se nepodařilo načíst. Obnovte prosím stránku.';
  }
})();

document.getElementById('giftForm').addEventListener('submit', async e => {
  e.preventDefault();
  gMsg.textContent = '';
  const name = document.getElementById('gBuyer').value.trim();
  const email = document.getElementById('gEmail').value.trim();
  if (!gGame.value) { gMsg.textContent = 'Vyberte prosím hru.'; gGame.focus(); return; }
  if (name.length < 2) { gMsg.textContent = ERRORS.INVALID_NAME; document.getElementById('gBuyer').focus(); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { gMsg.textContent = ERRORS.INVALID_EMAIL; document.getElementById('gEmail').focus(); return; }
  if (!document.getElementById('gConsent').checked) { gMsg.textContent = 'Potvrďte prosím souhlas se zpracováním údajů.'; return; }
  gSubmit.disabled = true;
  const label = gSubmit.textContent;
  gSubmit.textContent = 'Odesílám…';
  try {
    await rpc('submit_gift_request', {
      p_game_slug: gGame.value,
      p_buyer_name: name,
      p_buyer_email: email,
      p_recipient_name: document.getElementById('gRecipient').value.trim() || null,
      p_message: document.getElementById('gMessage').value.trim() || null,
      p_website: document.getElementById('gWebsite').value
    });
    document.getElementById('formView').classList.add('hidden');
    document.getElementById('doneView').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  } catch (err) {
    const key = Object.keys(ERRORS).find(k => String(err.message).includes(k));
    gMsg.textContent = key ? ERRORS[key] : 'Objednávku se nepodařilo odeslat. Zkuste to prosím znovu.';
    gSubmit.disabled = false;
    gSubmit.textContent = label;
  }
});
