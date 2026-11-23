// Juice: particles, shockwaves, lightning, floating combat text, screen shake.
// Everything lives in world (table) coordinates and is drawn by the renderer.

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.bolts = [];
    this.shakeAmt = 0;
    this.flash = null;
    this.ambient = [];
  }

  clear() { this.parts = []; this.texts = []; this.rings = []; this.bolts = []; }

  burst(x, y, color, n = 14, speed = 260, life = 0.6, size = 3, gravity = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.9);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: size * (0.6 + Math.random() * 0.8), g: gravity, drag: 2.5 });
    }
  }

  sink(x, y, color) {
    this.burst(x, y, color, 22, 320, 0.7, 3.5);
    this.burst(x, y, '#ffffff', 8, 180, 0.4, 2);
    this.rings.push({ x, y, r: 6, max: 55, life: 0.45, t: 0, color, w: 4 });
  }

  clack(x, y, impact) {
    if (impact < 250) return;
    const n = Math.min(10, Math.floor(impact / 220));
    this.burst(x, y, '#fffde7', n, impact * 0.18, 0.25, 1.8);
  }

  explosion(x, y, radius, small = false) {
    this.rings.push({ x, y, r: 10, max: radius, life: 0.45, t: 0, color: '#ffcc80', w: small ? 4 : 8 });
    this.rings.push({ x, y, r: 5, max: radius * 0.6, life: 0.3, t: 0, color: '#fff', w: 3 });
    this.burst(x, y, '#ff7043', small ? 18 : 40, small ? 400 : 650, 0.7, 4.5);
    this.burst(x, y, '#ffd54f', small ? 10 : 24, small ? 300 : 500, 0.5, 3.5);
    this.burst(x, y, '#555', small ? 6 : 14, 160, 1.1, 7, -30);
  }

  lightning(arcs) {
    for (const [x1, y1, x2, y2] of arcs) {
      const pts = [[x1, y1]];
      const n = 7;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
        const off = (Math.random() - 0.5) * 34;
        pts.push([x1 + (x2 - x1) * t + (nx / l) * off, y1 + (y2 - y1) * t + (ny / l) * off]);
      }
      pts.push([x2, y2]);
      this.bolts.push({ pts, life: 0.45, max: 0.45 });
      this.burst(x2, y2, '#80d8ff', 12, 220, 0.4, 2.5);
    }
  }

  coins(x, y, n) {
    for (let i = 0; i < Math.min(12, n); i++) {
      this.parts.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -150 - Math.random() * 180, life: 0.9, max: 0.9, color: '#ffd54f', size: 4, g: 420, drag: 0.5, coin: true });
    }
  }

  embers(x, y) {
    this.parts.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40, life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#ff7043' : '#ffca28', size: 2.5, g: -40, drag: 1 });
  }

  sparkle(x, y, color = '#fff59d') {
    this.parts.push({ x: x + (Math.random() - 0.5) * 22, y: y + (Math.random() - 0.5) * 22, vx: 0, vy: -10, life: 0.5, max: 0.5, color, size: 2, g: 0, drag: 0, star: true });
  }

  text(x, y, str, color = '#fff', size = 18, opts = {}) {
    // avoid stacking texts exactly on top of each other
    let oy = 0;
    for (const t of this.texts) if (Math.abs(t.x - x) < 60 && Math.abs(t.y0 - y) < 26 && t.t < 0.4) oy -= 24;
    this.texts.push({ x, y: y + oy, y0: y + oy, str, color, size, t: 0, life: opts.life || 1.3, big: opts.big });
  }

  shake(a) { this.shakeAmt = Math.min(30, Math.max(this.shakeAmt, a)); }
  flashScreen(color, life = 0.25) { this.flash = { color, life, max: life }; }

  update(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += (p.g || 0) * dt;
      const k = Math.max(0, 1 - (p.drag || 0) * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
    for (const r of this.rings) { r.t += dt; }
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const t of this.texts) { t.t += dt; t.y = t.y0 - Math.min(1, t.t / 0.5) * 34; }
    this.texts = this.texts.filter((t) => t.t < t.life);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 45);
    if (this.flash) { this.flash.life -= dt; if (this.flash.life <= 0) this.flash = null; }
  }

  draw(ctx, scale) {
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.w * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r + (r.max - r.r) * easeOut(k), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.coin) {
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * Math.abs(Math.cos(p.life * 12)) + 0.5, 0, 0, Math.PI * 2); ctx.fill();
      } else if (p.star) {
        const s = p.size * (1 + a);
        ctx.fillRect(p.x - s * 2, p.y - 0.6, s * 4, 1.2);
        ctx.fillRect(p.x - 0.6, p.y - s * 2, 1.2, s * 4);
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * a), 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const b of this.bolts) {
      const a = b.life / b.max;
      for (const [w, col] of [[9, 'rgba(128,216,255,0.35)'], [3, '#e1f5fe']]) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath();
        b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.t / t.life;
      const pop = t.t < 0.12 ? 1 + (0.12 - t.t) * 4 : 1;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const size = (t.size / Math.max(0.6, scale)) * pop;
      ctx.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}

function easeOut(t) { return 1 - (1 - t) * (1 - t); }
