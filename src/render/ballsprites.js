// Per-pixel ball renderer. Each ball is shaded as a real sphere and textured
// in its own body frame (stripe band, number discs, cue-ball dots), so numbers
// and stripes visibly roll with the ball's actual 3D rotation. Sprites are
// cached and only redrawn when the ball's orientation changes.
import { BALL_COLORS } from '../config.js';
import { quatToMat } from '../core/util.js';

const GLYPH = 32;
const LIGHT = norm([-0.42, -0.55, -0.72]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);

function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class BallSprites {
  constructor() {
    this.glyphs = {};
    this.cache = new Map();
    this.m = new Float32Array(9);
    this.palette = 'classic';
  }

  glyph(num) {
    if (this.glyphs[num]) return this.glyphs[num];
    const c = makeCanvas(GLYPH, GLYPH);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.font = `bold ${num > 9 ? 17 : 21}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(num), GLYPH / 2, GLYPH / 2 + 1.5);
    const d = g.getImageData(0, 0, GLYPH, GLYPH).data;
    const a = new Uint8Array(GLYPH * GLYPH);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    this.glyphs[num] = a;
    return a;
  }

  colorFor(ball) {
    if (ball.group === 'cue') return [246, 243, 232];
    if (ball.mods.gold) return [232, 180, 40];
    const base = BALL_COLORS[ball.num] || '#888';
    return hexRgb(base);
  }

  /** Returns a canvas with the ball rendered at the given pixel diameter. */
  sprite(ball, size) {
    size = Math.max(8, Math.min(72, Math.round(size)));
    let e = this.cache.get(ball.id);
    const q = ball.q;
    const modsKey = (ball.mods.gold ? 'g' : '') + (ball.mods.fire ? 'f' : '') + (ball.mods.split ? 's' : '') + ball.group + ball.num;
    if (e && e.size === size && e.modsKey === modsKey &&
        Math.abs(e.q[0] - q[0]) + Math.abs(e.q[1] - q[1]) + Math.abs(e.q[2] - q[2]) + Math.abs(e.q[3] - q[3]) < 0.004) {
      return e.canvas;
    }
    if (!e || e.size !== size) {
      const canvas = makeCanvas(size, size);
      const ctx = canvas.getContext('2d');
      e = { canvas, ctx, img: ctx.createImageData(size, size), size };
      this.cache.set(ball.id, e);
    }
    e.q = q.slice();
    e.modsKey = modsKey;
    this.paint(ball, e);
    e.ctx.putImageData(e.img, 0, 0);
    return e.canvas;
  }

  paint(ball, e) {
    const S = e.size, data = e.img.data;
    const c = S / 2, rp = S / 2 - 0.6;
    const m = quatToMat(ball.q, this.m);
    const base = this.colorFor(ball);
    const isStripe = ball.group === 'stripe' || (ball.num >= 9 && ball.num <= 15);
    const isCue = ball.group === 'cue';
    const showNum = !isCue && ball.num > 0;
    const glyph = showNum ? this.glyph(ball.num) : null;
    const gold = !!ball.mods.gold;
    const split = !!ball.mods.split;
    const fire = !!ball.mods.fire;
    const specPow = gold ? 22 : 48;
    for (let py = 0; py < S; py++) {
      const ny = (py + 0.5 - c) / rp;
      for (let px = 0; px < S; px++) {
        const idx = (py * S + px) * 4;
        const nx = (px + 0.5 - c) / rp;
        const d2 = nx * nx + ny * ny;
        const dist = Math.sqrt(d2);
        let alpha = (1 - dist) * rp + 0.5;
        if (alpha <= 0) { data[idx + 3] = 0; continue; }
        if (alpha > 1) alpha = 1;
        const nz = -Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
        // body-frame coordinates (inverse rotation = transpose)
        const bx = m[0] * nx + m[3] * ny + m[6] * nz;
        const by = m[1] * nx + m[4] * ny + m[7] * nz;
        const bz = m[2] * nx + m[5] * ny + m[8] * nz;
        let r = base[0], g = base[1], b = base[2];
        if (isStripe && (bx > 0.56 || bx < -0.56)) { r = 245; g = 242; b = 232; }
        if (isCue) {
          if (bx > 0.975 || bx < -0.975 || by > 0.975 || by < -0.975 || bz > 0.975 || bz < -0.975) { r = 200; g = 30; b = 40; }
        } else if (showNum && (bz > 0.855 || bz < -0.855)) {
          r = 245; g = 242; b = 232;
          const u = (bz < 0 ? bx : -bx) / 0.52, v = by / 0.52;
          const gx = ((u * 0.5 + 0.5) * GLYPH) | 0, gy = ((v * 0.5 + 0.5) * GLYPH) | 0;
          if (gx >= 0 && gy >= 0 && gx < GLYPH && gy < GLYPH) {
            const a = glyph[gy * GLYPH + gx] / 255;
            if (a > 0) { r = r * (1 - a) + 20 * a; g = g * (1 - a) + 20 * a; b = b * (1 - a) + 20 * a; }
          }
        }
        if (split && by < 0.04 && by > -0.04 && (bz < 0.85 && bz > -0.85)) { r *= 0.25; g *= 0.25; b *= 0.25; }
        // shading
        const lam = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
        let shade = 0.32 + 0.78 * lam;
        shade *= 0.72 + 0.28 * -nz;
        const sh = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
        let spec = Math.pow(sh, specPow) * (gold ? 1.1 : 0.85);
        if (fire) { r = r * 0.7 + 90; g = g * 0.75 + 20; }
        r = r * shade + spec * 255; g = g * shade + spec * 255; b = b * shade + spec * 255;
        if (gold) { r += spec * 40; g += spec * 20; }
        data[idx] = r > 255 ? 255 : r;
        data[idx + 1] = g > 255 ? 255 : g;
        data[idx + 2] = b > 255 ? 255 : b;
        data[idx + 3] = alpha * 255;
      }
    }
  }

  forget(id) { this.cache.delete(id); }
  clear() { this.cache.clear(); }
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
