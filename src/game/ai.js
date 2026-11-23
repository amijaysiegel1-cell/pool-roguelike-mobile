// Opponent AI. Generates candidate shots geometrically (ghost-ball aiming,
// mirrored bank shots, safeties), simulates each one on a cloned table, scores
// the outcome, then executes the best one with skill-dependent noise.
// Implemented as a generator so planning can be spread across frames.
import { PHYS, TABLE } from '../config.js';
import { pathClear, pocketAim } from '../physics/predict.js';
import { groupOf, remaining } from './rules.js';

const DEG = Math.PI / 180;

export function aimNoiseDeg(skill) {
  return 0.12 + 3.4 * Math.pow(1 - Math.max(0, Math.min(1, skill)), 1.5);
}

function now() { return (globalThis.performance || Date).now(); }

function powerFor(dist) {
  return Math.max(0.22, Math.min(0.9, 0.18 + dist / 1500));
}

function geometricCandidates(sim, cue, targets, profile) {
  const out = [];
  const R = cue.r;
  for (const t of targets) {
    for (const p of sim.table.pockets) {
      const aim = pocketAim(p);
      const tx = aim.x - t.x, ty = aim.y - t.y, tl = Math.hypot(tx, ty);
      if (tl < 1) continue;
      const gx = t.x - (tx / tl) * (R + t.r), gy = t.y - (ty / tl) * (R + t.r);
      const cx = gx - cue.x, cy = gy - cue.y, cl = Math.hypot(cx, cy);
      if (cl < 1) continue;
      const cosCut = (cx * tx + cy * ty) / (cl * tl);
      if (cosCut < 0.2) continue; // > ~78 degrees
      const clear1 = pathClear(sim, cue.x, cue.y, gx, gy, R, [cue.id, t.id]);
      const clear2 = pathClear(sim, t.x, t.y, aim.x, aim.y, t.r, [cue.id, t.id]);
      // difficulty: long distances & thin cuts are hard
      let diff = (cl + tl * 1.4) / 400 + (1 - cosCut) * 4;
      if (!clear1) diff += 6;
      if (!clear2) diff += 4;
      out.push({ angle: Math.atan2(cy, cx), power: powerFor(cl + tl), diff, target: t.id, kind: 'pot' });
    }
    if (profile.banks) {
      // one-rail bank: mirror the pocket aim across a cushion
      for (const p of sim.table.pockets) {
        const aim = pocketAim(p);
        const mirrors = [
          { x: -aim.x, y: aim.y }, { x: 2 * TABLE.W - aim.x, y: aim.y },
          { x: aim.x, y: -aim.y }, { x: aim.x, y: 2 * TABLE.H - aim.y },
        ];
        for (const m of mirrors) {
          const tx = m.x - t.x, ty = m.y - t.y, tl = Math.hypot(tx, ty);
          if (tl < 50 || tl > 1500) continue;
          const gx = t.x - (tx / tl) * (R + t.r), gy = t.y - (ty / tl) * (R + t.r);
          const cx = gx - cue.x, cy = gy - cue.y, cl = Math.hypot(cx, cy);
          const cosCut = (cx * tx + cy * ty) / (cl * tl);
          if (cosCut < 0.45) continue;
          out.push({ angle: Math.atan2(cy, cx), power: powerFor(cl + tl * 1.2) + 0.1, diff: 3 + (cl + tl) / 400 + (1 - cosCut) * 4, target: t.id, kind: 'bank' });
        }
      }
    }
    // plain hit at the centre (safety / break-up)
    const cx = t.x - cue.x, cy = t.y - cue.y;
    out.push({ angle: Math.atan2(cy, cx), power: 0.45, diff: 7, target: t.id, kind: 'safe' });
  }
  return out;
}

function positionScore(sim, cue, group) {
  // how many own balls have a clear straight shot at a pocket from here
  let score = 0;
  for (const b of sim.balls) {
    if (b.pocketed || b.group !== group) continue;
    for (const p of sim.table.pockets) {
      const aim = pocketAim(p);
      const tx = aim.x - b.x, ty = aim.y - b.y, tl = Math.hypot(tx, ty);
      const gx = b.x - (tx / tl) * (cue.r + b.r), gy = b.y - (ty / tl) * (cue.r + b.r);
      const cx = gx - cue.x, cy = gy - cue.y, cl = Math.hypot(cx, cy) || 1;
      const cosCut = (cx * tx + cy * ty) / (cl * tl);
      if (cosCut < 0.5) continue;
      if (pathClear(sim, cue.x, cue.y, gx, gy, cue.r, [cue.id, b.id]) && pathClear(sim, b.x, b.y, aim.x, aim.y, b.r, [cue.id, b.id])) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

export function scoreOutcome(sim, side, ownLeftBefore, isBreak) {
  const own = groupOf(side);
  const opp = side === 'player' ? 'stripe' : 'solid';
  const log = sim.log;
  let s = 0;
  const first = log.first !== null ? sim.ball(log.first) : null;
  let foul = false;
  if (!first) foul = true;
  else if (!isBreak) {
    const legal = ownLeftBefore > 0 ? own : 'eight';
    if (first.group !== legal) foul = true;
  }
  let ownSunk = 0, eight = false;
  for (const p of log.pockets) {
    const b = sim.ball(p.id);
    if (b.group === 'cue') foul = true;
    else if (b.group === 'eight') eight = true;
    else if (b.group === own) ownSunk++;
    else if (b.group === opp) s -= 25;
  }
  if (eight && !isBreak) {
    if (!foul && remaining(sim, own) === 0) s += 2000; else s -= 2000;
  }
  if (foul) s -= 160;
  s += ownSunk * 110;
  if (!foul && ownSunk > 0) s += positionScore(sim, sim.cue, ownLeftBefore - ownSunk > 0 ? own : 'eight') * 14;
  if (!foul && ownSunk === 0) {
    // safety value: leave the opponent nothing
    s -= positionScore(sim, sim.cue, opp) * 6;
  }
  return s;
}

/**
 * @param fight  provides .sim, and helpers
 * @param side   'enemy' normally
 * @param profile { skill, banks, power, rng }
 */
export function* planShot(sim0, side, isBreak, ballInHand, profile, rng) {
  const own = groupOf(side);
  const ownLeft = remaining(sim0, own);
  const targetGroup = isBreak ? null : ownLeft > 0 ? own : 'eight';
  let sim = sim0;
  let place = null;
  let budgetStart = now();
  const tick = function* () {
    if (now() - budgetStart > 7) { yield; budgetStart = now(); }
  };

  if (isBreak) {
    const cue = sim.cue;
    let apex = null, bd = 1e9;
    for (const b of sim.balls) {
      if (b.pocketed || b.group === 'cue') continue;
      const d = Math.hypot(b.x - cue.x, b.y - cue.y);
      if (d < bd) { bd = d; apex = b; }
    }
    const ang = Math.atan2(apex.y - cue.y, apex.x - cue.x) + rng.gauss() * 0.004;
    return { angle: ang, power: 0.85 + rng.next() * 0.15, spinX: 0, spinY: -0.1, place: null };
  }

  const targets = sim.balls.filter((b) => !b.pocketed && b.group === targetGroup);

  if (ballInHand) {
    // try a handful of placements behind target balls lined up with pockets
    const spots = [];
    for (const t of targets) {
      for (const p of sim.table.pockets) {
        const aim = pocketAim(p);
        const tx = aim.x - t.x, ty = aim.y - t.y, tl = Math.hypot(tx, ty);
        if (!pathClear(sim, t.x, t.y, aim.x, aim.y, t.r, [t.id, sim.cue.id])) continue;
        for (const dist of [70, 130]) {
          const x = t.x - (tx / tl) * dist, y = t.y - (ty / tl) * dist;
          if (x < 20 || x > TABLE.W - 20 || y < 20 || y > TABLE.H - 20) continue;
          if (sim.balls.some((b) => !b.pocketed && b.group !== 'cue' && Math.hypot(b.x - x, b.y - y) < b.r * 2 + 2)) continue;
          spots.push({ x, y, d: tl + dist * 0.5 });
        }
      }
    }
    spots.sort((a, b) => a.d - b.d);
    const pick = spots.slice(0, 3);
    if (pick.length) {
      place = pick[Math.floor(rng.next() * Math.min(pick.length, profile.skill > 0.6 ? 1 : 3))];
      sim = sim0.clone();
      const c = sim.cue;
      c.pocketed = false; c.x = place.x; c.y = place.y; c.vx = c.vy = 0;
    }
  }

  const cue = sim.cue;
  let cands = geometricCandidates(sim, cue, targets, profile);
  cands.sort((a, b) => a.diff - b.diff);
  const potCands = cands.filter((c) => c.kind === 'pot').slice(0, profile.width || 9);
  const bankCands = cands.filter((c) => c.kind === 'bank').slice(0, profile.banks ? 5 : 0);
  const safeCands = cands.filter((c) => c.kind === 'safe').slice(0, 2);
  const pool = [...potCands, ...bankCands, ...safeCands];
  const variants = [];
  for (const c of pool) {
    variants.push({ ...c, spinX: 0, spinY: 0 });
    variants.push({ ...c, power: Math.min(1, c.power + 0.12), spinY: c.kind === 'pot' ? -0.45 : 0.3, spinX: 0 });
    if (profile.skill > 0.7 && c.kind === 'pot') variants.push({ ...c, power: c.power * 0.85, spinY: 0.5, spinX: 0 });
  }

  let best = null;
  for (const v of variants) {
    const s = sim.clone();
    s.listener = null;
    s.startShot();
    const speed = PHYS.MIN_SPEED + (PHYS.MAX_SPEED - PHYS.MIN_SPEED) * v.power;
    s.strike(s.cue, v.angle, speed, v.spinX, v.spinY);
    s.run(7, PHYS.DT * 1.5);
    let score = scoreOutcome(s, side, ownLeft, false) - v.diff * 3;
    if (v.kind === 'bank' && profile.trickBias) score += profile.trickBias;
    score += rng.next() * 8; // break ties, add personality
    if (!best || score > best.score) best = { ...v, score };
    yield* tick();
  }

  if (!best) best = { angle: rng.next() * Math.PI * 2, power: 0.5, spinX: 0, spinY: 0 };
  // execution error
  const sigma = aimNoiseDeg(profile.skill) * DEG;
  const angle = best.angle + rng.gauss() * sigma;
  const power = Math.max(0.1, Math.min(1, best.power * (1 + rng.gauss() * 0.06 * (1 - profile.skill))));
  return { angle, power, spinX: best.spinX, spinY: best.spinY, place, kind: best.kind, planned: best };
}

/** For "The Table Itself": choose a tilt direction that helps its group. */
export function* planTilt(sim0, side, strength, rng) {
  let best = null;
  const own = groupOf(side);
  let t0 = now();
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const s = sim0.clone();
    s.startShot();
    s.fields.push({ type: 'tilt', ax: Math.cos(ang) * strength, ay: Math.sin(ang) * strength, until: s.time + 0.8 });
    s.run(6, PHYS.DT * 2);
    let score = 0;
    for (const p of s.log.pockets) {
      const b = s.ball(p.id);
      if (b.group === own) score += 100;
      else if (b.group === 'cue') score += 40;
      else if (b.group === 'eight') score -= remaining(s, own) === 0 ? -500 : 300;
      else score -= 60;
    }
    score += rng.next() * 10;
    if (!best || score > best.score) best = { ang, score };
    if (now() - t0 > 7) { yield; t0 = now(); }
  }
  return { tilt: best.ang, strength };
}
