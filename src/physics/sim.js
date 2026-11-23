// Deterministic billiards simulation.
//
// Each ball carries linear velocity (vx, vy) plus two spin terms:
//   (wx, wy)  surface velocity of the contact point with the cloth caused by
//             rotation. Rolling without slipping means w = -v. Backspin points
//             w along v, topspin/overspin points it against v.
//   ws        side spin (english), as the surface speed at the equator. ws > 0
//             is clockwise when viewed from above.
// Sliding friction acts on the slip (v + w) and converts it into roll, which
// yields real draw / follow / stun behaviour. Side spin grips cushions and
// (slightly) object balls, producing english-induced rebound and throw.
//
// The simulation is pure and deterministic: the AI and the trajectory preview
// clone it and run it forward to see the future.
import { PHYS, TABLE } from '../config.js';
import { quatMulAxisAngle } from '../core/util.js';

const { W, H } = TABLE;

export function makeBall(id, num, group, x, y, r = TABLE.R) {
  return {
    id, num, group, x, y, r, m: 1,
    vx: 0, vy: 0, wx: 0, wy: 0, ws: 0,
    pocketed: false, pocketId: -1,
    q: [1, 0, 0, 0],
    mods: {},
    rails: 0, lastHitBy: null, travel: 0, ghostThrough: null,
  };
}

export class Sim {
  constructor(table) {
    this.table = table;
    this.balls = [];
    this.fields = [];   // force fields (data only, see applyFields)
    this.movers = [];   // kinematic round obstacles (orbiting moons etc.)
    this.time = 0;
    this.listener = null;
    this.log = newLog();
    this.flags = {};    // per-shot physics flags (ghost, explode...) read by hooks
    this.orient = true; // update ball orientation (off for AI clones)
    this.trace = null;  // optional {ids:Set, every, paths:{id:[[x,y]...]}}
    this.railBoost = 0; // extra restitution this shot
    this.rollMul = 1;   // rolling resistance multiplier (fast/slow felt, zero-g)
  }

  get cue() { return this.balls.find((b) => b.group === 'cue'); }
  ball(id) { return this.balls.find((b) => b.id === id); }
  live() { return this.balls.filter((b) => !b.pocketed); }

  clone() {
    const s = new Sim(this.table);
    s.balls = this.balls.map((b) => ({ ...b, q: b.q.slice() }));
    s.fields = this.fields.map((f) => ({ ...f }));
    s.movers = this.movers.map((m) => ({ ...m }));
    s.time = this.time;
    s.flags = { ...this.flags };
    s.railBoost = this.railBoost;
    s.rollMul = this.rollMul;
    s.orient = false;
    return s;
  }

  startShot() {
    this.log = newLog();
    for (const b of this.balls) {
      b.rails = 0; b.lastHitBy = null; b.travel = 0; b.ghostThrough = null;
    }
  }

  strike(ball, angle, speed, spinX = 0, spinY = 0, spinK = PHYS.SPIN_K) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    ball.vx = dx * speed; ball.vy = dy * speed;
    // topspin (spinY > 0) makes the contact point move backwards (w = -k v)
    ball.wx = -dx * spinK * spinY * speed;
    ball.wy = -dy * spinK * spinY * speed;
    // right english (spinX > 0) => counter-clockwise from above => ws < 0
    ball.ws = -spinK * spinX * speed * 0.9;
  }

  isMoving() {
    const s = PHYS.STOP_SPEED;
    for (const b of this.balls) {
      if (b.pocketed) continue;
      if (Math.abs(b.vx) > s || Math.abs(b.vy) > s) return true;
    }
    if (this.fields.some((f) => f.type === 'tilt' && f.until > this.time)) return true;
    return false;
  }

  emit(type, a, b, c) { if (this.listener) this.listener(type, a, b, c); }

  /** Advance until everything stops (or the time cap). Returns elapsed sim time. */
  run(maxTime = PHYS.MAX_SIM_TIME, dt = PHYS.DT) {
    const t0 = this.time;
    let steps = 0;
    while (this.time - t0 < maxTime) {
      this.step(dt);
      steps++;
      if ((steps & 7) === 0 && !this.isMoving()) break;
    }
    return this.time - t0;
  }

  step(dt) {
    // adaptive sub-stepping so very fast balls (break shots) never tunnel
    let vmax = 0;
    for (const b of this.balls) {
      if (b.pocketed) continue;
      const v = Math.abs(b.vx) + Math.abs(b.vy);
      if (v > vmax) vmax = v;
    }
    const sub = Math.min(8, Math.max(1, Math.ceil((vmax * dt) / 3)));
    if (sub > 1) { for (let i = 0; i < sub; i++) this.substep(dt / sub); return; }
    this.substep(dt);
  }

  substep(dt) {
    this.time += dt;
    const balls = this.balls;
    const n = balls.length;

    // kinematic movers
    for (const m of this.movers) {
      if (m.type === 'orbit') {
        const a = m.phase + m.speed * this.time;
        const nx = m.cx + Math.cos(a) * m.rad, ny = m.cy + Math.sin(a) * m.rad;
        m.vx = -Math.sin(a) * m.rad * m.speed; m.vy = Math.cos(a) * m.rad * m.speed;
        m.x = nx; m.y = ny;
      }
    }

    // integrate
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.pocketed) continue;
      this.applyFields(b, dt);
      if (b.vx === 0 && b.vy === 0 && b.wx === 0 && b.wy === 0) {
        if (b.ws !== 0) b.ws *= Math.max(0, 1 - 6 * dt);
        continue;
      }
      friction(b, dt, this.rollMul);
      const sp = Math.hypot(b.vx, b.vy);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.travel += sp * dt;
      if (this.orient && sp > 0) {
        // angular velocity from spin state: w = (R*wy_ang, -R*wx_ang) (z axis into table)
        const ox = -b.wy / b.r, oy = b.wx / b.r, oz = b.ws / b.r;
        const om = Math.hypot(ox, oy, oz);
        if (om > 1e-4) quatMulAxisAngle(b.q, ox / om, oy / om, oz / om, om * dt);
      }
      if (this.trace && this.trace.ids.has(b.id)) {
        const p = this.trace.paths[b.id] || (this.trace.paths[b.id] = []);
        const last = p[p.length - 1];
        if (!last || Math.hypot(last[0] - b.x, last[1] - b.y) > 6) p.push([b.x, b.y]);
      }
    }

    // ball-ball collisions (skip pairs where both are at rest). Alternate the
    // sweep direction each pass so simultaneous contacts (the break!) don't
    // inherit a left/right bias from array order.
    for (let iter = 0; iter < 4; iter++) {
      let any = false;
      const fwd = ((this._sweep = (this._sweep || 0) + 1) & 1) === 0;
      for (let ii = 0; ii < n; ii++) {
        const i = fwd ? ii : n - 1 - ii;
        const a = balls[i];
        if (a.pocketed) continue;
        const aMoving = a.vx !== 0 || a.vy !== 0;
        for (let jj = ii + 1; jj < n; jj++) {
          const j = fwd ? jj : n - 1 - jj;
          const b = balls[j];
          if (b.pocketed) continue;
          if (!aMoving && b.vx === 0 && b.vy === 0) continue;
          if (this.collideBalls(a, b)) any = true;
        }
      }
      if (!any) break;
    }

    // cushions, bumpers, movers, pockets
    const segs = this.table.segs;
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.pocketed) continue;
      if (b.vx === 0 && b.vy === 0) continue;
      for (let k = 0; k < segs.length; k++) this.collideSeg(b, segs[k]);
      for (const bp of this.table.bumpers) this.collideCircle(b, bp, 0, 0, bp.e ?? 0.9, 'bumper');
      for (const m of this.movers) this.collideCircle(b, m, m.vx || 0, m.vy || 0, m.e ?? 0.95, 'mover');
      this.checkPocket(b);
    }
  }

  applyFields(b, dt) {
    if (!this.fields.length && !b.mods.homing) return;
    let ax = 0, ay = 0;
    const sp = Math.hypot(b.vx, b.vy);
    for (const f of this.fields) {
      if (f.until !== undefined && this.time > f.until) continue;
      if (f.groups && !f.groups.includes(b.group)) continue;
      if (f.type === 'tilt') {
        if (b.vx === 0 && b.vy === 0 && b.wx === 0) { b.wx = 0.0001; }
        ax += f.ax; ay += f.ay;
      } else if (f.type === 'drift' && sp > 25) {
        ax += f.ax; ay += f.ay;
      } else if (f.type === 'attract' && sp > 25) {
        const dx = f.x - b.x, dy = f.y - b.y, d = Math.hypot(dx, dy);
        if (d < f.radius && d > 1) {
          const k = f.k * (1 - d / f.radius);
          ax += (dx / d) * k; ay += (dy / d) * k;
        }
      } else if (f.type === 'pockets' && sp > 25) {
        for (const p of this.table.pockets) {
          if (f.owner && p.owner !== f.owner) continue;
          const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
          if (d < f.radius && d > 1) {
            const k = f.k * (1 - d / f.radius);
            ax += (dx / d) * k; ay += (dy / d) * k;
          }
        }
      } else if (f.type === 'curve' && b.group === 'cue' && sp > 40) {
        // massé: side spin bends the path
        const k = Math.max(-1, Math.min(1, b.ws / 900)) * f.k;
        ax += (-b.vy / sp) * -k; ay += (b.vx / sp) * -k;
      }
    }
    // pockets with their own gravity (black holes, magnets)
    if (sp > 25) {
      for (const p of this.table.pockets) {
        if (!p.attract) continue;
        if (p.attract.groups && !p.attract.groups.includes(b.group)) continue;
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
        if (d < p.attract.radius && d > 1) {
          const k = p.attract.k * (1 - d / p.attract.radius);
          ax += (dx / d) * k; ay += (dy / d) * k;
        }
      }
    }
    if (b.mods.homing && sp > 30 && b.group !== 'cue') {
      let best = null, bd = 1e9;
      for (const p of this.table.pockets) {
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best && bd < 380) {
        ax += ((best.x - b.x) / bd) * 260; ay += ((best.y - b.y) / bd) * 260;
      }
    }
    if (ax || ay) {
      b.vx += ax * dt; b.vy += ay * dt;
      // keep the ball rolling-consistent under field forces (fields act like a slope)
      b.wx -= ax * dt; b.wy -= ay * dt;
    }
  }

  collideBalls(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const rr = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) {
      // ghost pass-through ends once separated
      if (a.ghostThrough === b.id) a.ghostThrough = -1;
      if (b.ghostThrough === a.id) b.ghostThrough = -1;
      return false;
    }
    // Ghost cue: pass through the first object ball touched
    const cue = a.group === 'cue' ? a : b.group === 'cue' ? b : null;
    if (cue && this.flags.ghost) {
      const other = cue === a ? b : a;
      if (cue.ghostThrough === other.id) return false;
      if (cue.ghostThrough === null) {
        cue.ghostThrough = other.id;
        this.emit('ghost', cue, other);
        return false;
      }
    }
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d, ny = dy / d;
    const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    // separate
    const overlap = rr - d;
    const ima = 1 / a.m, imb = 1 / b.m, ims = ima + imb;
    a.x -= nx * overlap * (ima / ims); a.y -= ny * overlap * (ima / ims);
    b.x += nx * overlap * (imb / ims); b.y += ny * overlap * (imb / ims);
    if (rvn >= 0) return false;

    const e = (a.mods.bouncy || b.mods.bouncy) ? 1 : PHYS.BALL_E;
    const jn = (-(1 + e) * rvn) / ims;
    a.vx -= jn * ima * nx; a.vy -= jn * ima * ny;
    b.vx += jn * imb * nx; b.vy += jn * imb * ny;

    // throw (tangential friction incl. side spin)
    const tx = -ny, ty = nx;
    const slip = (a.vx - b.vx) * tx + (a.vy - b.vy) * ty + a.ws + b.ws;
    const maxJ = PHYS.BALL_MU * jn;
    let jt = -slip / 7;
    if (jt > maxJ) jt = maxJ; else if (jt < -maxJ) jt = -maxJ;
    a.vx += jt * tx; a.vy += jt * ty;
    b.vx -= jt * tx; b.vy -= jt * ty;
    a.ws += 2.5 * jt; b.ws += 2.5 * jt;

    // bookkeeping for rules (first contact, banks, combos)
    const impact = -rvn;
    if (cue) {
      const other = cue === a ? b : a;
      if (this.log.first === null) {
        this.log.first = other.id;
        this.log.firstTime = this.time;
        this.emit('first', cue, other, impact);
      }
      other.lastHitBy = cue.id;
      other.rails = 0;
    } else {
      a.lastHitBy = b.id; b.lastHitBy = a.id;
      a.rails = 0; b.rails = 0;
    }
    this.log.collisions++;
    this.emit('collide', a, b, impact);
    return true;
  }

  collideSeg(b, s) {
    // closest point on segment
    let t = ((b.x - s.x1) * s.dx + (b.y - s.y1) * s.dy) / s.len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s.x1 + s.dx * t, cy = s.y1 + s.dy * t;
    const dx = b.x - cx, dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r) return;
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d, ny = dy / d;
    b.x = cx + nx * b.r; b.y = cy + ny * b.r;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    this.cushionBounce(b, nx, ny, vn, s.kind);
  }

  collideCircle(b, c, cvx, cvy, e, kind) {
    const dx = b.x - c.x, dy = b.y - c.y;
    const rr = b.r + c.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d, ny = dy / d;
    b.x = c.x + nx * rr; b.y = c.y + ny * rr;
    const vn = (b.vx - cvx) * nx + (b.vy - cvy) * ny;
    if (vn >= 0) return;
    const j = -(1 + e) * vn;
    b.vx += j * nx; b.vy += j * ny;
    // keep roll consistent-ish
    b.wx = -b.vx * 0.6; b.wy = -b.vy * 0.6;
    this.emit(kind, b, c, -vn);
  }

  cushionBounce(b, nx, ny, vn, kind) {
    let e = PHYS.RAIL_E + this.railBoost;
    if (b.mods.bouncy) e = 1.02;
    // softer at high speed (real cushions compress)
    e -= Math.min(0.08, (-vn / 2600) * 0.08);
    const jn = -(1 + e) * vn;
    const tx = -ny, ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx += jn * nx; b.vy += jn * ny;
    // english grip
    const slip = vt - b.ws;
    const maxJ = PHYS.RAIL_MU * jn;
    let jt = -slip / 3.5;
    if (jt > maxJ) jt = maxJ; else if (jt < -maxJ) jt = -maxJ;
    b.vx += jt * tx; b.vy += jt * ty;
    b.ws -= 2.5 * jt;
    // rolling spin: mostly re-aligned with the new direction after the rail
    const wn = b.wx * nx + b.wy * ny;
    const vnNew = b.vx * nx + b.vy * ny;
    b.wx += (-vnNew * 0.75 - wn) * nx; b.wy += (-vnNew * 0.75 - wn) * ny;
    b.rails++;
    if (b.group === 'cue' && this.log.first === null) this.log.cueRailsBefore++;
    this.log.railHits++;
    this.emit('cushion', b, kind, -vn);
  }

  checkPocket(b) {
    const pockets = this.table.pockets;
    let hit = null;
    for (let i = 0; i < pockets.length; i++) {
      const p = pockets[i];
      if (p.accept && !p.accept.includes(b.group)) continue;
      const dx = b.x - p.x, dy = b.y - p.y;
      const cap = p.r * (b.r / TABLE.R) ** 0.3;
      if (dx * dx + dy * dy < cap * cap) { hit = p; break; }
    }
    const fd = TABLE.FALL_DEPTH;
    if (!hit && (b.x < -fd || b.x > W + fd || b.y < -fd || b.y > H + fd)) {
      let bd = 1e9;
      for (const p of pockets) {
        if (p.kind === 'hole' || p.accept) continue;
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < bd) { bd = d; hit = p; }
      }
    }
    if (!hit) return;
    this.pocketBall(b, hit);
  }

  pocketBall(b, hit) {
    if (b.pocketed) return;
    b.pocketed = true;
    b.pocketId = hit.id;
    b.sinkX = hit.x; b.sinkY = hit.y;
    this.log.pockets.push({
      id: b.id, pocket: hit.id, time: this.time, rails: b.rails, lastHitBy: b.lastHitBy, travel: b.travel,
    });
    this.emit('pocket', b, hit);
  }
}

function newLog() {
  return { first: null, firstTime: 0, cueRailsBefore: 0, pockets: [], collisions: 0, railHits: 0 };
}

function friction(b, dt, rollMul) {
  const ux = b.vx + b.wx, uy = b.vy + b.wy;
  const u = Math.hypot(ux, uy);
  const slideDv = PHYS.SLIDE_DECEL * dt;
  if (u > 0.5) {
    if (3.5 * slideDv >= u) {
      // finishes sliding this step: snap to pure rolling
      b.vx -= (2 / 7) * ux; b.vy -= (2 / 7) * uy;
      b.wx = -b.vx; b.wy = -b.vy;
    } else {
      const fx = ux / u, fy = uy / u;
      b.vx -= fx * slideDv; b.vy -= fy * slideDv;
      b.wx -= 2.5 * fx * slideDv; b.wy -= 2.5 * fy * slideDv;
    }
  } else {
    const sp = Math.hypot(b.vx, b.vy);
    const dec = (PHYS.ROLL_DECEL + PHYS.ROLL_DRAG * sp) * dt * rollMul;
    if (sp <= dec || sp < PHYS.STOP_SPEED) {
      b.vx = 0; b.vy = 0; b.wx = 0; b.wy = 0;
    } else {
      const k = (sp - dec) / sp;
      b.vx *= k; b.vy *= k;
      b.wx = -b.vx; b.wy = -b.vy;
    }
  }
  // side spin decay
  if (b.ws !== 0) {
    const s = Math.abs(b.ws);
    const ns = Math.max(0, s - (PHYS.SIDE_DECEL + PHYS.SIDE_DECAY * s) * dt);
    b.ws = Math.sign(b.ws) * ns;
  }
  // stop tiny residual motion
  if (Math.abs(b.vx) < PHYS.STOP_SPEED && Math.abs(b.vy) < PHYS.STOP_SPEED &&
      Math.abs(b.vx + b.wx) < PHYS.STOP_SPEED && Math.abs(b.vy + b.wy) < PHYS.STOP_SPEED) {
    b.vx = 0; b.vy = 0; b.wx = 0; b.wy = 0;
  }
}
