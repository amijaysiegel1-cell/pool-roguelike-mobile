// Branching act map, Slay-the-Spire style: a grid of floors, several
// non-crossing paths from bottom to top, typed nodes, and a boss at the top.

export const FLOORS = 8;   // floors 0..7, boss above
const COLS = 5;

const ICONS = { fight: '⚔️', elite: '💀', shop: '🛒', event: '💬', mystery: '❓', rest: '🔥', treasure: '🎁', boss: '👑', black: '🕴️' };
export const NODE_INFO = {
  fight: { icon: ICONS.fight, name: 'Match' },
  elite: { icon: ICONS.elite, name: 'Elite Match' },
  shop: { icon: ICONS.shop, name: 'Shop' },
  event: { icon: ICONS.event, name: 'Encounter' },
  mystery: { icon: ICONS.mystery, name: 'Mystery' },
  rest: { icon: ICONS.rest, name: 'Rest Stop' },
  treasure: { icon: ICONS.treasure, name: 'Treasure' },
  boss: { icon: ICONS.boss, name: 'Boss' },
};

export function generateMap(rng, act, opts = {}) {
  const grid = Array.from({ length: FLOORS }, () => Array(COLS).fill(null));
  const edges = new Set();
  const nodes = [];
  const get = (f, c) => {
    if (!grid[f][c]) {
      const n = { id: `${act}-${f}-${c}`, floor: f, col: c, type: null, next: [], x: 0, y: 0 };
      grid[f][c] = n;
      nodes.push(n);
    }
    return grid[f][c];
  };
  const crosses = (f, a, b) => {
    for (const e of edges) {
      const [ef, ea, eb] = e.split(':').map(Number);
      if (ef !== f) continue;
      if ((a < ea && b > eb) || (a > ea && b < eb)) return true;
    }
    return false;
  };
  const nPaths = 5;
  const starts = rng.shuffle([0, 1, 2, 3, 4]);
  for (let p = 0; p < nPaths; p++) {
    let c = p < 3 ? starts[p] : rng.int(0, COLS - 1);
    get(0, c);
    for (let f = 0; f < FLOORS - 1; f++) {
      let nc = Math.max(0, Math.min(COLS - 1, c + rng.int(-1, 1)));
      if (crosses(f, c, nc)) nc = c;
      edges.add(`${f}:${c}:${nc}`);
      const a = get(f, c), b = get(f + 1, nc);
      if (!a.next.includes(b.id)) a.next.push(b.id);
      c = nc;
    }
  }
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const parents = {};
  for (const n of nodes) for (const id of n.next) (parents[id] ||= []).push(n);

  // assign types floor by floor
  const weights = [['fight', 44], ['event', 15], ['mystery', 13], ['elite', 10], ['shop', 9], ['rest', 7]];
  nodes.sort((a, b) => a.floor - b.floor || a.col - b.col);
  for (const n of nodes) {
    if (n.floor === 0) { n.type = 'fight'; continue; }
    if (n.floor === 4) { n.type = 'treasure'; continue; }
    if (n.floor === FLOORS - 1) { n.type = 'rest'; continue; }
    for (let tries = 0; tries < 8; tries++) {
      let t = rng.weighted(weights);
      if (t === 'elite' && n.floor < 2) continue;
      if (t === 'rest' && (n.floor < 3 || n.floor === FLOORS - 2)) continue;
      if (t === 'shop' && (opts.noShops || n.floor < 2)) continue;
      const ps = parents[n.id] || [];
      if (['elite', 'shop', 'rest'].includes(t) && ps.some((p) => p.type === t)) continue;
      n.type = t;
      break;
    }
    if (!n.type) n.type = 'fight';
  }
  // guarantee at least one shop and one elite in the act (when allowed)
  const mids = nodes.filter((n) => n.floor >= 2 && n.floor <= 6 && n.floor !== 4);
  if (!opts.noShops && !nodes.some((n) => n.type === 'shop') && mids.length) {
    const c = mids.filter((n) => n.type === 'fight');
    rng.pick(c.length ? c : mids).type = 'shop';
  }
  if (!nodes.some((n) => n.type === 'elite')) { const c = mids.filter((n) => n.type === 'fight' && n.floor >= 3); if (c.length) rng.pick(c).type = 'elite'; }

  // layout (0..1 coords), with a little jitter for an organic look
  for (const n of nodes) {
    n.x = (n.col + 0.5) / COLS + rng.range(-0.05, 0.05);
    n.y = n.floor;
  }
  const bossNode = { id: `${act}-boss`, floor: FLOORS, col: 2, type: 'boss', next: [], x: 0.5, y: FLOORS };
  for (const n of nodes) if (n.floor === FLOORS - 1) n.next.push(bossNode.id);
  nodes.push(bossNode);
  byId[bossNode.id] = bossNode;
  return { act, nodes, floors: FLOORS };
}
