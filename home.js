// Questplore – úvodní stránka. Seznam her a recenze se načítají z databáze (řídí je administrace).
const gamesEl = document.getElementById('games');
const testNote = document.getElementById('testNote');

function gameUrl(slug) { return './game.html?game=' + encodeURIComponent(slug); }

function renderGame(g, index, single) {
  const soon = g.status === 'coming_soon';
  const card = el('article', 'dossier card reveal');
  card.dataset.tab = 'Spis · ' + (g.city || 'Případ');
  if (!single) card.style.setProperty('--tilt', ([-0.7, 0.5, -0.3][index % 3]) + 'deg');
  card.appendChild(el('span', 'stamp', soon ? 'Připravujeme' : 'Otevřeno'));

  const visual = el('div', 'visual' + (g.cover_url ? '' : ' noimg'));
  if (g.cover_url) visual.style.backgroundImage = `url("${String(g.cover_url).replace(/"/g, '%22')}")`;
  else visual.style.setProperty('--h', hue(g.name));
  visual.appendChild(el('div', 'monogram', monogram(g.name)));
  card.appendChild(visual);

  const body = el('div', 'body paperText');
  if (g.city) body.appendChild(el('div', 'place', g.city));
  const h3 = el('h3');
  const link = el('a', null, g.name);
  link.href = gameUrl(g.slug);
  link.style.textDecoration = 'none';
  h3.appendChild(link);
  body.appendChild(h3);
  if (g.tagline) body.appendChild(el('p', 'tagline', g.tagline));
  if (g.description) body.appendChild(el('p', 'desc', g.description));

  const facts = el('ul', 'facts');
  const dur = rangeText(g.duration_min, g.duration_max, 'min');
  const pl = playersText(g.min_players, g.max_players);
  if (dur) facts.appendChild(el('li', null, '⏱ ' + dur));
  if (pl) facts.appendChild(el('li', null, '👥 ' + pl));
  if (g.max_devices) facts.appendChild(el('li', null, '📱 až ' + g.max_devices + ' zař.'));
  if (facts.children.length) body.appendChild(facts);

  if (g.rating_count > 0 && g.rating_avg != null) {
    const r = el('div', 'rate');
    r.innerHTML = '';
    const b = el('b', null, starsText(g.rating_avg));
    r.appendChild(b);
    r.appendChild(document.createTextNode(` ${czNumber(g.rating_avg)} · ${g.rating_count} ${g.rating_count === 1 ? 'hodnocení' : g.rating_count < 5 ? 'hodnocení' : 'hodnocení'}`));
    body.appendChild(r);
  }

  const actions = el('div', 'actions');
  const open = el('a', 'btn ink', soon ? 'Nahlédnout do spisu' : 'Otevřít spis');
  open.href = gameUrl(g.slug);
  actions.appendChild(open);
  if (!soon && g.purchase) {
    const buy = el('a', 'btn secondary', 'Koupit');
    buy.style.color = '#1c1710'; buy.style.borderColor = '#8d825f'; buy.style.background = 'transparent';
    buy.href = './purchase.html?game=' + encodeURIComponent(g.slug);
    actions.appendChild(buy);
  }
  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

function showError() {
  gamesEl.className = 'games';
  gamesEl.replaceChildren();
  const box = el('div', 'error');
  box.appendChild(el('p', null, 'Hry se nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu.'));
  const retry = el('button', 'btn secondary', 'Zkusit znovu');
  retry.type = 'button';
  retry.onclick = loadGames;
  box.appendChild(retry);
  gamesEl.appendChild(box);
  gamesEl.setAttribute('aria-busy', 'false');
}

async function loadGames() {
  gamesEl.setAttribute('aria-busy', 'true');
  gamesEl.className = 'games';
  gamesEl.replaceChildren(el('div', 'skeleton'));
  try {
    const games = await rpc('get_public_games', {});
    if (!Array.isArray(games)) throw new Error('Bad response');
    gamesEl.replaceChildren();
    if (!games.length) {
      gamesEl.appendChild(el('div', 'empty', 'Nové příběhy právě připravujeme. Brzy se tu objeví první spisy.'));
    } else {
      const single = games.length === 1;
      gamesEl.className = 'games' + (single ? ' single' : '');
      games.forEach((g, i) => gamesEl.appendChild(renderGame(g, i, single)));
      observeReveal();
    }
    testNote.classList.toggle('hidden', !games.some(g => g.purchase));
    gamesEl.setAttribute('aria-busy', 'false');
  } catch (e) {
    showError();
  }
  scheduleTrail();
}

/* Recenze: sekce se zobrazí, jen když existuje alespoň jedno skutečné hodnocení. */
async function loadReviews() {
  try {
    const data = await rpc('get_public_reviews', { p_limit: 6 });
    if (!data || !data.count) return;
    const sec = document.getElementById('recenze');
    const big = document.getElementById('ratingBig');
    big.replaceChildren(
      el('span', 'n', czNumber(data.avg)),
      el('span', 'st', starsText(data.avg)),
      el('span', 'c', `z ${data.count} ${data.count === 1 ? 'hodnocení' : 'hodnocení'} hráčů`)
    );
    const notes = document.getElementById('notes');
    notes.replaceChildren();
    (data.reviews || []).forEach((r, i) => {
      const n = el('figure', 'note reveal');
      n.style.margin = '0';
      n.style.setProperty('--tilt', ([-1.2, 0.8, -0.5, 1][i % 4]) + 'deg');
      n.appendChild(el('div', 'st', starsText(r.rating)));
      n.appendChild(el('blockquote', null, '„' + r.comment + '“'));
      const when = r.date ? new Date(r.date).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' }) : '';
      n.appendChild(el('footer', null, `Hráč hry ${r.game_name}${when ? ' · ' + when : ''}`));
      notes.appendChild(n);
    });
    sec.classList.remove('hidden');
    observeReveal();
    scheduleTrail();
  } catch (e) { /* recenze nejsou zásadní, stránka funguje i bez nich */ }
}

/* Cvičný úkol: skryté slovo v prvních písmenech řádků. */
(function puzzle() {
  const form = document.getElementById('puzzleForm');
  if (!form) return;
  const input = document.getElementById('puzzleAnswer');
  const msg = document.getElementById('puzzleMsg');
  const note = document.getElementById('puzzleNote');
  const win = document.getElementById('puzzleWin');
  const hintBtn = document.getElementById('hintBtn');
  const hintList = document.getElementById('hintList');
  const hints = [
    'Nezáleží jen na tom, co řádky říkají. Podívejte se, jak začínají.',
    'Vezměte první písmeno každého řádku a přečtěte je shora dolů.'
  ];
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let started = 0, used = 0, wrong = 0, solved = false;
  const start = () => { if (!started) started = Date.now(); };
  input.addEventListener('focus', start);
  hintBtn.addEventListener('click', () => {
    start();
    if (used >= hints.length) return;
    const item = el('div', 'hintItem', `Nápověda ${used + 1}: ${hints[used]}`);
    hintList.appendChild(item);
    used++;
    if (used >= hints.length) { hintBtn.disabled = true; hintBtn.textContent = 'Nápovědy vyčerpány'; }
    else hintBtn.textContent = `Další nápověda (${used}/${hints.length})`;
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (solved) return;
    start();
    const ans = norm(input.value);
    if (!ans) { msg.className = 'puzzleMsg'; msg.textContent = 'Napište skryté slovo.'; return; }
    if (ans === 'stopa') {
      solved = true;
      const sec = Math.max(1, Math.round((Date.now() - started) / 1000));
      const t = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      note.classList.add('solved');
      msg.className = 'puzzleMsg ok';
      msg.textContent = `Správně! Slovo STOPA. Čas: ${t}${used ? `, nápověd: ${used}` : ', bez nápovědy'}. Přesně takhle začíná každá hra.`;
      input.disabled = true;
      hintBtn.classList.add('hidden');
      win.classList.add('show');
    } else {
      wrong++;
      msg.className = 'puzzleMsg bad';
      msg.textContent = wrong >= 2 && used === 0 ? 'To není ono. Zkuste nápovědu, nikdo to nepočítá… zatím.' : 'To není ono. Podívejte se pozorněji.';
      note.animate && !REDUCED && note.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
    }
  });
})();

observeReveal();
loadGames();
loadReviews();
