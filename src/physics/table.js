// Table geometry builder. A table is described by a list of pocket specs plus
// optional obstacles; this module turns that into cushion segments, jaws and
// pocket capture circles. Rebuilding is cheap, so bosses can move pockets and
// items can resize them between shots.
import { TABLE } from '../config.js';

const { W, H } = TABLE;

export function standardPockets() {
  return [
    { kind: 'corner', corner: 'tl' }, { kind: 'corner', corner: 'tr' },
    { kind: 'corner', corner: 'bl' }, { kind: 'corner', corner: 'br' },
    { kind: 'side', side: 'left', t: H / 2 }, { kind: 'side', side: 'right', t: H / 2 },
  ];
}

const SIDES = {
  // origin, direction along side, outward normal, length
  top: { ox: 0, oy: 0, dx: 1, dy: 0, nx: 0, ny: -1, L: W },
  bottom: { ox: 0, oy: H, dx: 1, dy: 0, nx: 0, ny: 1, L: W },
  left: { ox: 0, oy: 0, dx: 0, dy: 1, nx: -1, ny: 0, L: H },
  right: { ox: W, oy: 0, dx: 0, dy: 1, nx: 1, ny: 0, L: H },
};

const CORNERS = {
  tl: { x: 0, y: 0, sides: [['top', 0], ['left', 0]] },
  tr: { x: W, y: 0, sides: [['top', 1], ['right', 0]] },
  bl: { x: 0, y: H, sides: [['bottom', 0], ['left', 1]] },
  br: { x: W, y: H, sides: [['bottom', 1], ['right', 1]] },
};

/**
 * @param {object} spec
 *  pockets: pocket specs (see standardPockets)
 *  pocketScale: multiplies mouth widths & capture radii
 *  bumpers: [{x,y,r}] static round obstacles
 *  walls: [{x1,y1,x2,y2}] extra cushion segments
 */
export function buildTable(spec = {}) {
  const pocketSpecs = spec.pockets || standardPockets();
  const ps = spec.pocketScale || 1;
  const cornerMouth = TABLE.CORNER_MOUTH * Math.sqrt(ps);
  const segs = [];
  const pockets = [];
  const gaps = { top: [], bottom: [], left: [], right: [] };
  const jawJobs = []; // {side, at, towardSign, kind}

  pocketSpecs.forEach((p, idx) => {
    const base = { id: idx, spec: p, owner: p.owner || null, attract: p.attract || null, glow: p.glow || null };
    if (p.kind === 'corner') {
      const c = CORNERS[p.corner];
      const off = 7;
      const ox = c.x === 0 ? -off : off, oy = c.y === 0 ? -off : off;
      pockets.push({ ...base, kind: 'corner', x: c.x + ox, y: c.y + oy, r: TABLE.CORNER_CAPTURE * ps, mouth: cornerMouth });
      for (const [side, end] of c.sides) {
        const L = SIDES[side].L;
        if (end === 0) { gaps[side].push([-1, cornerMouth]); jawJobs.push({ side, at: cornerMouth, toward: -1, corner: true }); }
        else { gaps[side].push([L - cornerMouth, L + 1]); jawJobs.push({ side, at: L - cornerMouth, toward: 1, corner: true }); }
      }
    } else if (p.kind === 'side') {
      const s = SIDES[p.side];
      const m = (p.mouth || TABLE.SIDE_MOUTH) * ps;
      const px = s.ox + s.dx * p.t + s.nx * 11, py = s.oy + s.dy * p.t + s.ny * 11;
      pockets.push({ ...base, kind: 'side', side: p.side, t: p.t, x: px, y: py, r: (p.capture || TABLE.SIDE_CAPTURE) * ps, mouth: m });
      gaps[p.side].push([p.t - m, p.t + m]);
      jawJobs.push({ side: p.side, at: p.t - m, toward: 1 });
      jawJobs.push({ side: p.side, at: p.t + m, toward: -1 });
    } else if (p.kind === 'hole') {
      pockets.push({ ...base, kind: 'hole', x: p.x, y: p.y, r: (p.r || 22) * Math.min(ps, 1.3) });
    }
  });

  // Rails = complement of gaps on each side.
  for (const side of Object.keys(SIDES)) {
    const s = SIDES[side];
    const g = gaps[side].slice().sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of g) {
      if (merged.length && iv[0] <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    }
    let cur = 0;
    const solid = [];
    for (const [a, b] of merged) { if (a > cur) solid.push([cur, a]); cur = Math.max(cur, b); }
    if (cur < s.L) solid.push([cur, s.L]);
    for (const [a, b] of solid) {
      if (b - a < 1) continue;
      segs.push({ x1: s.ox + s.dx * a, y1: s.oy + s.dy * a, x2: s.ox + s.dx * b, y2: s.oy + s.dy * b, kind: 'rail', side });
    }
  }

  // Jaws: short angled segments leading into each pocket.
  for (const j of jawJobs) {
    const s = SIDES[j.side];
    // skip jaws whose anchor lies inside another gap (overlapping pockets)
    const inside = gaps[j.side].some(([a, b]) => j.at > a + 0.5 && j.at < b - 0.5);
    if (inside || j.at <= 0 || j.at >= s.L) continue;
    const px = s.ox + s.dx * j.at, py = s.oy + s.dy * j.at;
    const out = j.corner ? 0.8 : 0.93, along = j.corner ? 0.6 : 0.36;
    const dx = s.nx * out + s.dx * j.toward * along, dy = s.ny * out + s.dy * j.toward * along;
    const L = 18;
    segs.push({ x1: px, y1: py, x2: px + dx * L, y2: py + dy * L, kind: 'jaw', side: j.side });
  }

  for (const w of spec.walls || []) segs.push({ ...w, kind: 'wall' });
  for (const s of segs) {
    s.dx = s.x2 - s.x1; s.dy = s.y2 - s.y1;
    s.len2 = s.dx * s.dx + s.dy * s.dy || 1;
  }

  return {
    W, H,
    segs,
    pockets,
    bumpers: (spec.bumpers || []).map((b) => ({ e: 0.9, ...b })),
    pocketScale: ps,
    spec,
  };
}

// Head string / foot spot helpers (player breaks from the bottom).
export const HEAD_Y = H * 0.75;
export const FOOT_SPOT = { x: W / 2, y: H * 0.25 };

export function rackPositions(R, gap = 0.15) {
  // Triangle apex points toward the breaker (down). Returns 15 positions.
  const pos = [];
  const dx = R * 2 + gap;
  const dy = Math.sqrt(3) * (R + gap / 2);
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      pos.push({ x: FOOT_SPOT.x + (i - row / 2) * dx, y: FOOT_SPOT.y - row * dy });
    }
  }
  return pos;
}

// Standard-ish 8-ball rack order: 8 in the middle of row 3, one solid and one
// stripe in the back corners, the rest shuffled.
export function rackOrder(rng) {
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const order = new Array(15).fill(0);
  order[4] = 8; // row index 2, middle
  const s = rng.shuffle(solids), t = rng.shuffle(stripes);
  // back corners: indices 10 and 14
  const flip = rng.chance(0.5);
  order[10] = flip ? s.pop() : t.pop();
  order[14] = flip ? t.pop() : s.pop();
  const rest = rng.shuffle([...s, ...t]);
  for (let i = 0; i < 15; i++) if (!order[i]) order[i] = rest.pop();
  return order;
}
