// Small DOM helpers shared by all screens.
import { esc } from '../core/util.js';
import { ITEM_MAP } from '../data/items.js';
import { CARD_MAP } from '../data/cards.js';

export { esc };

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function hpBar(hp, max, cls = '') {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  return `<div class="hpbar ${cls}"><div class="ghost" style="width:${pct}%"></div><div class="fill" style="width:${pct}%"></div><div class="lbl">${Math.max(0, Math.round(hp))} / ${max}</div></div>`;
}

export function setHp(barEl, hp, max) {
  if (!barEl) return;
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  barEl.querySelector('.fill').style.width = pct + '%';
  barEl.querySelector('.ghost').style.width = pct + '%';
  barEl.querySelector('.lbl').textContent = `${Math.max(0, Math.round(hp))} / ${max}`;
}

export const TYPE_NAMES = { cue: 'Cue Upgrade', ball: 'Ball Modifier', relic: 'Relic', consumable: 'Consumable', curse: 'Cursed Relic', card: 'Shot Card' };

export function itemChip(id, n = 1, act = `item:${id}`) {
  const d = ITEM_MAP[id];
  if (!d) return '';
  return `<button class="chip r-${d.rarity}" data-act="${act}" aria-label="${esc(d.name)}">${d.icon}${n > 1 ? `<span class="n">${n}</span>` : ''}</button>`;
}

export function cardChip(id, act = `card:${id}`) {
  const d = CARD_MAP[id];
  if (!d) return '';
  return `<button class="lo-card r-${d.rarity}" data-act="${act}">${d.icon}<span class="cn">${esc(d.name)}</span></button>`;
}

export function offerHtml(kind, id, extra = '', act = '') {
  const d = kind === 'card' ? CARD_MAP[id] : ITEM_MAP[id];
  if (!d) return '';
  const type = kind === 'card' ? 'Shot Card' : TYPE_NAMES[d.type];
  return `<button class="offer r-${d.rarity}" data-act="${act}">
    <div class="ico">${d.icon}</div>
    <div class="grow"><div class="t">${esc(d.name)}</div><div class="rar">${d.rarity} · ${type}</div><div class="d">${esc(d.desc)}</div></div>
    ${extra}
  </button>`;
}

export function describe(kind, id) {
  const d = kind === 'card' ? CARD_MAP[id] : ITEM_MAP[id];
  if (!d) return { title: '?', html: '' };
  const type = kind === 'card' ? 'Shot Card' : TYPE_NAMES[d.type];
  let extra = '';
  if (d.charges) extra = `<div class="muted" style="margin-top:6px">⚡ ${d.charges} charge${d.charges > 1 ? 's' : ''} per fight. Tap it during your turn to arm.</div>`;
  return {
    title: `${d.icon} ${esc(d.name)}`,
    html: `<div class="rar r-${d.rarity}">${d.rarity} · ${type}</div><p style="line-height:1.45">${esc(d.desc)}</p>${extra}`,
  };
}

export function confetti(root) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = innerWidth; c.height = innerHeight;
  root.appendChild(c);
  const g = c.getContext('2d');
  const parts = Array.from({ length: 120 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 200,
    r: Math.random() * 6, c: ['#ffd54f', '#4fc3f7', '#ef5350', '#69f0ae', '#ba68c8', '#fff'][Math.floor(Math.random() * 6)], a: Math.random() * 6,
  }));
  let t0 = performance.now();
  const tick = (t) => {
    const dt = Math.min(0.05, (t - t0) / 1000); t0 = t;
    g.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.a += dt * 6;
      g.fillStyle = p.c; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillRect(-4, -2, 8, 4); g.restore();
    }
    if (parts.some((p) => p.y < c.height + 20)) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}
