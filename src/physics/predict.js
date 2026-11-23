// Aim-guide geometry: analytic ray casts for the standard guide, plus a
// simulation-based trajectory trace for Laser Sight style previews.
import { TABLE, PHYS } from '../config.js';

function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const fx = ox - cx, fy = oy - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= -0.01 ? Math.max(0, t) : Infinity;
}

function raySeg(ox, oy, dx, dy, s, r) {
  // capsule = segment swept by radius r
  let best = Infinity, nx = 0, ny = 0;
  const L = Math.sqrt(s.len2);
  const ux = s.dx / L, uy = s.dy / L;
  for (const side of [-1, 1]) {
    const px = -uy * side, py = ux * side; // normal
    const ax = s.x1 + px * r, ay = s.y1 + py * r;
    const denom = dx * px + dy * py;
    if (denom >= 0) continue; // moving away from this face
    const t = ((ax - ox) * px + (ay - oy) * py) / denom;
    if (t < 0 || t >= best) continue;
    const hx = ox + dx * t - ax, hy = oy + dy * t - ay;
    const along = hx * ux + hy * uy;
    if (along >= 0 && along <= L) { best = t; nx = px; ny = py; }
  }
  for (const [ex, ey] of [[s.x1, s.y1], [s.x2, s.y2]]) {
    const t = rayCircle(ox, oy, dx, dy, ex, ey, r);
    if (t < best) {
      best = t;
      const hx = ox + dx * t - ex, hy = oy + dy * t - ey, hl = Math.hypot(hx, hy) || 1;
      nx = hx / hl; ny = hy / hl;
    }
  }
  return { t: best, nx, ny };
}

/** Cast a ball of radius r from (ox,oy) along angle. */
export function castBall(sim, ox, oy, angle, r, ignoreIds = []) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = { t: Infinity, type: null };
  for (const b of sim.balls) {
    if (b.pocketed || ignoreIds.includes(b.id)) continue;
    const t = rayCircle(ox, oy, dx, dy, b.x, b.y, r + b.r);
    if (t < best.t) best = { t, type: 'ball', ball: b };
  }
  for (const s of sim.table.segs) {
    const h = raySeg(ox, oy, dx, dy, s, r);
    if (h.t < best.t) best = { t: h.t, type: 'seg', nx: h.nx, ny: h.ny };
  }
  for (const bp of sim.table.bumpers) {
    const t = rayCircle(ox, oy, dx, dy, bp.x, bp.y, r + bp.r);
    if (t < best.t) {
      const hx = ox + dx * t - bp.x, hy = oy + dy * t - bp.y, hl = Math.hypot(hx, hy) || 1;
      best = { t, type: 'seg', nx: hx / hl, ny: hy / hl };
    }
  }
  for (const p of sim.table.pockets) {
    // stop the guide when the ball would drop
    const t = rayCircle(ox, oy, dx, dy, p.x, p.y, p.r * 0.85);
    if (t < best.t) best = { t, type: 'pocket', pocket: p };
  }
  if (best.t === Infinity) best.t = 2000;
  best.x = ox + dx * best.t; best.y = oy + dy * best.t;
  return best;
}

/**
 * Standard aim guide. Returns line segments to draw.
 * { path:[[x,y]...], ghost:{x,y}|null, objLine, cueLine }
 */
export function aimGuide(sim, angle, spinY = 0, bounces = 1) {
  const cue = sim.cue;
  if (!cue || cue.pocketed) return null;
  const path = [[cue.x, cue.y]];
  let ox = cue.x, oy = cue.y, ang = angle;
  let out = { path, ghost: null, objLine: null, cueLine: null, hitBall: null };
  for (let k = 0; k <= bounces; k++) {
    const h = castBall(sim, ox, oy, ang, cue.r, [cue.id]);
    path.push([h.x, h.y]);
    if (h.type === 'ball') {
      const b = h.ball;
      out.ghost = { x: h.x, y: h.y };
      out.hitBall = b;
      const nx = b.x - h.x, ny = b.y - h.y, nl = Math.hypot(nx, ny) || 1;
      const ux = nx / nl, uy = ny / nl;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const cosCut = Math.max(0, dx * ux + dy * uy);
      out.objLine = { x1: b.x, y1: b.y, x2: b.x + ux * (60 + 170 * cosCut), y2: b.y + uy * (60 + 170 * cosCut) };
      // cue ball tangent line (bent by follow/draw)
      let tx = dx - ux * cosCut, ty = dy - uy * cosCut;
      const tl = Math.hypot(tx, ty);
      if (tl > 0.02) {
        tx /= tl; ty /= tl;
        const bend = spinY * 0.6 * cosCut;
        let cx = tx * (1 - Math.abs(bend)) + ux * bend, cy = ty * (1 - Math.abs(bend)) + uy * bend;
        const cl = Math.hypot(cx, cy) || 1;
        cx /= cl; cy /= cl;
        const L = 40 + 110 * Math.sqrt(1 - cosCut * cosCut);
        out.cueLine = { x1: h.x, y1: h.y, x2: h.x + cx * L, y2: h.y + cy * L };
      } else if (Math.abs(spinY) > 0.15) {
        const L = 60 * Math.abs(spinY);
        const s = spinY > 0 ? 1 : -1;
        out.cueLine = { x1: h.x, y1: h.y, x2: h.x + ux * L * s, y2: h.y + uy * L * s };
      }
      break;
    }
    if (h.type !== 'seg' || k === bounces) break;
    // reflect
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const d = dx * h.nx + dy * h.ny;
    const rx = dx - 2 * d * h.nx, ry = dy - 2 * d * h.ny;
    ang = Math.atan2(ry, rx);
    ox = h.x + h.nx * 0.5; oy = h.y + h.ny * 0.5;
  }
  return out;
}

/** Full simulation preview (Laser Sight). Returns {paths:{id:[[x,y]]}, ids:[...]} */
export function tracePreview(sim, angle, speed, spinX, spinY, spinK, flags = {}, maxTime = 3.2) {
  const s = sim.clone();
  s.flags = { ...flags };
  s.listener = null;
  const cue = s.cue;
  s.startShot();
  const ids = new Set(s.balls.filter((b) => !b.pocketed).map((b) => b.id));
  s.trace = { ids, paths: {} };
  for (const b of s.balls) if (!b.pocketed) s.trace.paths[b.id] = [[b.x, b.y]];
  s.strike(cue, angle, speed, spinX, spinY, spinK);
  s.run(maxTime, PHYS.DT * 2);
  // keep only balls that moved
  const paths = {};
  for (const id of Object.keys(s.trace.paths)) {
    const p = s.trace.paths[id];
    const b = s.ball(+id);
    if (p.length > 1) {
      if (b) p.push([b.x, b.y]);
      paths[id] = { pts: p, pocketed: b?.pocketed, group: b?.group };
    }
  }
  return paths;
}

/** True if a ball of radius r can travel from A to B without touching other balls. */
export function pathClear(sim, ax, ay, bx, by, r, ignore = []) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  for (const b of sim.balls) {
    if (b.pocketed || ignore.includes(b.id)) continue;
    let t = ((b.x - ax) * dx + (b.y - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t - b.x, cy = ay + dy * t - b.y;
    if (cx * cx + cy * cy < (r + b.r - 0.5) ** 2) return false;
  }
  return true;
}

export function pocketAim(p) {
  // a point slightly inside the pocket mouth that balls should be sent toward
  if (p.kind === 'corner') return { x: p.x * 0.4 + (p.x < 250 ? 0 : TABLE.W) * 0.6, y: p.y * 0.4 + (p.y < 500 ? 0 : TABLE.H) * 0.6 };
  if (p.kind === 'side') {
    if (p.side === 'left') return { x: 2, y: p.y };
    if (p.side === 'right') return { x: TABLE.W - 2, y: p.y };
    if (p.side === 'top') return { x: p.x, y: 2 };
    return { x: p.x, y: TABLE.H - 2 };
  }
  return { x: p.x, y: p.y };
}
