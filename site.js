// Questplore – společné funkce webu (úvodní stránka, stránka hry, poukaz).
const SUPABASE_URL = 'https://hnhyscllpnyzbxhrffph.supabase.co';
const SUPABASE_KEY = 'sb_publishable_w0N986iN3rTUBQjDLogNhQ_BXcmNRWH';
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

async function rpc(name, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
      signal: controller.signal
    });
    const txt = await res.text();
    let body = null;
    try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
    if (!res.ok) throw new Error((body && body.message) || ('HTTP ' + res.status));
    return body;
  } finally { clearTimeout(timer); }
}

function monogram(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
  return letters.toUpperCase();
}
function hue(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return 20 + (h % 40); // teplé hnědé až olivové odstíny
}
function rangeText(min, max, unit) {
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
function starsText(n) {
  const full = Math.round(Number(n) || 0);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}
function czNumber(n) { return String(n).replace('.', ','); }

/* Odhalování textu (začerněné části) */
document.addEventListener('click', e => {
  const r = e.target.closest && e.target.closest('.redact');
  if (r) r.classList.toggle('open');
});

/* Vyskakování sekcí */
let revealObserver = null;
function observeReveal() {
  const items = document.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window) || REDUCED) { items.forEach(i => i.classList.add('in')); return; }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); revealObserver.unobserve(en.target); } });
    }, { threshold: 0.1 });
  }
  items.forEach(i => revealObserver.observe(i));
}

/* Světlo, které sleduje kurzor v úvodní části */
function initSpotlight() {
  const hero = document.querySelector('.hero');
  if (!hero || REDUCED || !window.matchMedia('(hover:hover)').matches) return;
  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    hero.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  }, { passive: true });
}

/* Stopa: čára, která se rozvíjí při posunu stránky a spojuje sekce označené data-trail */
const SVGNS = 'http://www.w3.org/2000/svg';
let trailState = null;
function initTrail() {
  const main = document.querySelector('main');
  if (!main) return;
  let svg = main.querySelector('svg.trail');
  if (!svg) { svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'trail'); svg.setAttribute('aria-hidden', 'true'); main.prepend(svg); }
  svg.replaceChildren();
  const W = main.clientWidth, H = main.offsetHeight;
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const mainTop = main.getBoundingClientRect().top + window.scrollY;
  const anchors = [...main.querySelectorAll('[data-trail]')];
  if (anchors.length < 2) return;
  const narrow = W < 720;
  const left = narrow ? W * 0.025 : W * 0.035, right = narrow ? W * 0.05 : W * 0.965;
  const pts = [];
  const first = anchors[0].getBoundingClientRect().top + window.scrollY - mainTop;
  pts.push({ x: right, y: Math.max(40, first - 40), node: false });
  anchors.forEach((a, i) => {
    const y = a.getBoundingClientRect().top + window.scrollY - mainTop + 28;
    pts.push({ x: i % 2 === 0 ? left : right, y, node: true });
  });
  pts.push({ x: W / 2, y: H - 30, node: false });
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dy = (b.y - a.y) / 2;
    d += ` C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
  }
  const base = document.createElementNS(SVGNS, 'path'); base.setAttribute('class', 'base'); base.setAttribute('d', d); svg.appendChild(base);
  const draw = document.createElementNS(SVGNS, 'path'); draw.setAttribute('class', 'draw'); draw.setAttribute('d', d); svg.appendChild(draw);
  const len = draw.getTotalLength();
  draw.style.strokeDasharray = len;
  const nodes = pts.filter(p => p.node).map(p => {
    const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('class', 'node'); c.setAttribute('r', 8); c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); svg.appendChild(c);
    return { c, y: p.y };
  });
  const pin = document.createElementNS(SVGNS, 'circle'); pin.setAttribute('class', 'pin'); pin.setAttribute('r', 6); svg.appendChild(pin);

  // bod na cestě podle výšky y (y roste podél cesty)
  const pointAtY = target => {
    let lo = 0, hi = len;
    for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (draw.getPointAtLength(mid).y < target) lo = mid; else hi = mid; }
    return { at: hi, p: draw.getPointAtLength(hi) };
  };
  trailState = { main, mainTop, H, len, draw, pin, nodes, pointAtY };
  updateTrail();
}
let trailTicking = false;
function updateTrail() {
  const t = trailState; if (!t) return;
  const target = Math.min(t.H, Math.max(0, window.scrollY + window.innerHeight * 0.55 - t.mainTop));
  if (REDUCED) { t.draw.style.strokeDashoffset = 0; t.nodes.forEach(n => n.c.classList.add('on')); return; }
  const { at, p } = t.pointAtY(target);
  t.draw.style.strokeDashoffset = t.len - at;
  t.pin.setAttribute('cx', p.x); t.pin.setAttribute('cy', p.y);
  t.nodes.forEach(n => n.c.classList.toggle('on', n.y <= target));
}
window.addEventListener('scroll', () => {
  if (trailTicking) return; trailTicking = true;
  requestAnimationFrame(() => { updateTrail(); trailTicking = false; });
}, { passive: true });
let trailResizeTimer = null;
function scheduleTrail() { clearTimeout(trailResizeTimer); trailResizeTimer = setTimeout(initTrail, 150); }
window.addEventListener('resize', scheduleTrail);
window.addEventListener('load', () => { initTrail(); if (window.ResizeObserver) { const m = document.querySelector('main'); if (m) new ResizeObserver(scheduleTrail).observe(m); } });

/* Společný záhlaví/patička odkazy se nastavují přímo v HTML. */
document.addEventListener('DOMContentLoaded', () => { observeReveal(); initSpotlight(); });
