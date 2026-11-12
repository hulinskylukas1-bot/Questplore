// Questplore – úvodní stránka. Seznam her se načítá z databáze, takže ho řídí administrace (Hry na webu).
const SUPABASE_URL = 'https://hnhyscllpnyzbxhrffph.supabase.co';
const SUPABASE_KEY = 'sb_publishable_w0N986iN3rTUBQjDLogNhQ_BXcmNRWH';

const gamesEl = document.getElementById('games');
const testNote = document.getElementById('testNote');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function monogram(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
  return letters.toUpperCase();
}

function hue(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return 120 + (h % 60); // zelenkavé až olivové odstíny
}

function range(min, max, unit) {
  if (min && max) return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
  if (max) return `do ${max} ${unit}`;
  if (min) return `od ${min} ${unit}`;
  return null;
}

function playersText(min, max) {
  if (min && max) return `${min}–${max} hráčů`;
  if (max) return `až ${max} hráčů`;
  if (min) return `od ${min} hráčů`;
  return null;
}

function renderGame(g) {
  const card = el('article', 'card reveal');
  const soon = g.status === 'coming_soon';

  const visual = el('div', 'visual' + (g.cover_url ? '' : ' noimg'));
  if (g.cover_url) visual.style.backgroundImage = `url("${String(g.cover_url).replace(/"/g, '%22')}")`;
  else visual.style.setProperty('--h', hue(g.name));
  const chip = el('span', 'chip' + (soon ? ' soon' : ''), soon ? 'Připravujeme' : 'Hra');
  visual.appendChild(chip);
  visual.appendChild(el('div', 'monogram', monogram(g.name)));
  card.appendChild(visual);

  const body = el('div', 'body');
  if (g.city) body.appendChild(el('div', 'place', g.city));
  body.appendChild(el('h3', null, g.name));
  if (g.tagline) body.appendChild(el('p', 'tagline', g.tagline));
  if (g.description) body.appendChild(el('p', 'desc', g.description));

  const facts = el('ul', 'facts');
  const dur = range(g.duration_min, g.duration_max, 'min');
  const pl = playersText(g.min_players, g.max_players);
  if (dur) facts.appendChild(el('li', null, '⏱ ' + dur));
  if (pl) facts.appendChild(el('li', null, '👥 ' + pl));
  if (g.max_devices) facts.appendChild(el('li', null, '📱 až ' + g.max_devices + ' zařízení'));
  if (facts.children.length) body.appendChild(facts);

  const actions = el('div', 'actions');
  if (soon) {
    const b = el('span', 'btn secondary', 'Brzy k dispozici');
    b.setAttribute('aria-disabled', 'true');
    actions.appendChild(b);
  } else {
    if (g.purchase) {
      const buy = el('a', 'btn primary', 'Koupit hru');
      buy.href = './purchase.html?game=' + encodeURIComponent(g.slug);
      actions.appendChild(buy);
    }
    const play = el('a', 'btn ' + (g.purchase ? 'secondary' : 'primary'), 'Mám herní kód');
    play.href = './';
    actions.appendChild(play);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_games`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const games = await res.json();
    if (!Array.isArray(games)) throw new Error('Bad response');
    gamesEl.replaceChildren();
    if (!games.length) {
      gamesEl.appendChild(el('div', 'empty', 'Nové příběhy právě připravujeme. Brzy se tu objeví první hry.'));
    } else {
      gamesEl.className = 'games' + (games.length === 1 ? ' single' : '');
      games.forEach(g => gamesEl.appendChild(renderGame(g)));
      observeReveal();
    }
    testNote.classList.toggle('hidden', !games.some(g => g.purchase));
    gamesEl.setAttribute('aria-busy', 'false');
  } catch (e) {
    showError();
  } finally {
    clearTimeout(timer);
  }
}

let io = null;
function observeReveal() {
  const items = document.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) { items.forEach(i => i.classList.add('in')); return; }
  if (!io) {
    io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
  }
  items.forEach(i => io.observe(i));
}

observeReveal();
loadGames();
