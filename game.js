// Questplore – stránka jedné hry. Obsah (popis, galerie, recenze) se načítá z databáze a upravuje se v administraci.
const root = document.getElementById('gameRoot');
const slug = new URLSearchParams(location.search).get('game') || '';

function section(id, eyebrow, title) {
  const s = el('section', 'section');
  s.id = id;
  s.setAttribute('data-trail', '');
  const head = el('div', 'sectionHead');
  head.appendChild(el('p', 'eyebrow', eyebrow));
  head.appendChild(el('h2', null, title));
  s.appendChild(head);
  return s;
}

function notFound() {
  root.replaceChildren();
  const s = el('section', 'gameHead');
  const box = el('div', 'empty');
  box.appendChild(el('p', null, 'Tenhle spis se nám nepodařilo najít. Možná ještě není zveřejněný.'));
  const a = el('a', 'btn primary', 'Zpět na všechny hry');
  a.href = './home.html#hry';
  box.appendChild(a);
  s.appendChild(box);
  root.appendChild(s);
  root.setAttribute('aria-busy', 'false');
  document.title = 'Hra nenalezena · Questplore';
}

function field(label, value) {
  const d = el('div');
  d.appendChild(el('span', null, label));
  d.appendChild(el('strong', null, value));
  return d;
}

function renderGame(g, others, reviews) {
  root.replaceChildren();
  document.title = `${g.name} · Questplore`;
  const soon = g.status === 'coming_soon';

  // Hlavička: spis
  const head = el('section', 'gameHead');
  const crumb = el('a', 'crumb', '← Všechny hry');
  crumb.href = './home.html#hry';
  head.appendChild(crumb);

  const file = el('div', 'dossier gameFile paperText');
  file.dataset.tab = 'Spis · ' + (g.city || 'Případ');
  file.appendChild(el('span', 'stamp', soon ? 'Připravujeme' : 'Otevřeno'));

  const left = el('div', 'left');
  if (g.city) left.appendChild(el('div', 'place', g.city));
  left.appendChild(el('h1', null, g.name));
  if (g.tagline) left.appendChild(el('p', 'tagline', g.tagline));
  if (g.description) left.appendChild(el('p', 'desc', g.description));

  const fields = el('div', 'fields');
  const dur = rangeText(g.duration_min, g.duration_max, 'min');
  const pl = playersText(g.min_players, g.max_players);
  fields.appendChild(field('Délka', dur || 'bude upřesněna'));
  fields.appendChild(field('Tým', pl || 'malý tým'));
  fields.appendChild(field('Zařízení', g.max_devices ? 'až ' + g.max_devices + ' telefony' : '1 telefon'));
  fields.appendChild(field('Místo', g.city || 'venku'));
  left.appendChild(fields);

  const actions = el('div', 'ctaBar');
  if (soon) {
    const b = el('span', 'btn secondary', 'Brzy k dispozici');
    b.setAttribute('aria-disabled', 'true');
    actions.appendChild(b);
  } else {
    if (g.purchase) {
      const buy = el('a', 'btn ink', 'Koupit hru');
      buy.href = './purchase.html?game=' + encodeURIComponent(g.slug);
      actions.appendChild(buy);
      const gift = el('a', 'btn secondary', 'Darovat poukaz');
      gift.href = './voucher.html?game=' + encodeURIComponent(g.slug);
      gift.style.color = '#1c1710'; gift.style.borderColor = '#8d825f'; gift.style.background = 'transparent';
      actions.appendChild(gift);
    }
    const play = el('a', 'btn secondary', 'Mám herní kód');
    play.href = './';
    play.style.color = '#1c1710'; play.style.borderColor = '#8d825f'; play.style.background = 'transparent';
    actions.appendChild(play);
  }
  left.appendChild(actions);
  if (!soon && g.purchase) left.appendChild(el('p', 'rate', 'Nákup je zatím v testovacím režimu a neúčtuje skutečné peníze.'));
  file.appendChild(left);

  const right = el('div', 'right');
  const pic = el('div', 'heroPic' + (g.cover_url ? '' : ' noimg'));
  if (g.cover_url) pic.style.backgroundImage = `url("${String(g.cover_url).replace(/"/g, '%22')}")`;
  else { pic.style.setProperty('--h', hue(g.name)); pic.appendChild(el('div', 'monogram', monogram(g.name))); }
  right.appendChild(pic);
  file.appendChild(right);
  head.appendChild(file);
  root.appendChild(head);

  // Co vás čeká
  const paras = String(g.details || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  if (paras.length) {
    const s = section('pribeh', 'Spis případu', 'Co vás čeká');
    const story = el('div', 'story reveal');
    paras.forEach(p => story.appendChild(el('p', null, p)));
    s.appendChild(story);
    root.appendChild(s);
  }

  // Galerie
  const gallery = Array.isArray(g.gallery) ? g.gallery.filter(Boolean) : [];
  if (gallery.length) {
    const s = section('galerie', 'Z místa činu', 'Fotografie');
    const grid = el('div', 'gallery reveal');
    gallery.forEach((u, i) => {
      const b = el('button');
      b.type = 'button';
      b.setAttribute('aria-label', `Zvětšit fotografii ${i + 1}`);
      const img = el('img');
      img.src = u; img.alt = `Fotografie ${i + 1} ze hry ${g.name}`; img.loading = 'lazy';
      b.appendChild(img);
      b.onclick = () => { const lb = document.getElementById('lightbox'); document.getElementById('lightboxImg').src = u; lb.showModal(); };
      grid.appendChild(b);
    });
    s.appendChild(grid);
    root.appendChild(s);
  }

  // Recenze
  if (reviews && reviews.count) {
    const s = section('recenze', 'Svědectví hráčů', 'Co říkají hráči');
    const big = el('div', 'ratingBig');
    big.append(el('span', 'n', czNumber(reviews.avg)), el('span', 'st', starsText(reviews.avg)), el('span', 'c', `z ${reviews.count} hodnocení hráčů`));
    s.appendChild(big);
    if ((reviews.reviews || []).length) {
      const notes = el('div', 'notes');
      reviews.reviews.forEach((r, i) => {
        const n = el('figure', 'note reveal');
        n.style.margin = '0';
        n.style.setProperty('--tilt', ([-1.2, 0.8, -0.5, 1][i % 4]) + 'deg');
        n.appendChild(el('div', 'st', starsText(r.rating)));
        n.appendChild(el('blockquote', null, '„' + r.comment + '“'));
        const when = r.date ? new Date(r.date).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' }) : '';
        n.appendChild(el('footer', null, when ? `Hráč · ${when}` : 'Hráč'));
        notes.appendChild(n);
      });
      s.appendChild(notes);
    }
    root.appendChild(s);
  }

  // Další hry
  const rest = (others || []).filter(o => o.slug !== g.slug);
  if (rest.length) {
    const s = section('dalsi', 'Další spisy', 'Další případy');
    const grid = el('div', 'others');
    rest.forEach(o => {
      const a = el('a', 'other');
      a.href = './game.html?game=' + encodeURIComponent(o.slug);
      a.appendChild(el('strong', null, o.name));
      a.appendChild(el('span', null, o.status === 'coming_soon' ? 'Připravujeme' : (o.tagline || o.city || 'Otevřít spis')));
      grid.appendChild(a);
    });
    s.appendChild(grid);
    root.appendChild(s);
  }

  root.setAttribute('aria-busy', 'false');
  observeReveal();
  scheduleTrail();
}

document.getElementById('lightboxClose').onclick = () => document.getElementById('lightbox').close();
document.getElementById('lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') e.target.close(); });

(async function load() {
  if (!slug) { notFound(); return; }
  try {
    const [g, others, reviews] = await Promise.all([
      rpc('get_public_game', { p_slug: slug }),
      rpc('get_public_games', {}).catch(() => []),
      rpc('get_public_reviews', { p_slug: slug, p_limit: 6 }).catch(() => null)
    ]);
    if (!g) { notFound(); return; }
    renderGame(g, others, reviews);
  } catch (e) {
    root.replaceChildren();
    const s = el('section', 'gameHead');
    const box = el('div', 'error');
    box.appendChild(el('p', null, 'Hru se nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu.'));
    const retry = el('button', 'btn secondary', 'Zkusit znovu');
    retry.type = 'button';
    retry.onclick = () => location.reload();
    box.appendChild(retry);
    s.appendChild(box);
    root.appendChild(s);
    root.setAttribute('aria-busy', 'false');
  }
})();
