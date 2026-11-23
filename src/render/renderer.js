// Canvas renderer for the match: themed table, rolling balls, aim guides, cue
// stick, field visuals and FX. Supports pinch-zoom via a camera transform.
import { TABLE } from '../config.js';
import { HEAD_Y, FOOT_SPOT } from '../physics/table.js';
import { BallSprites, makeCanvas } from './ballsprites.js';
import { FX } from './fx.js';
import { CUE_SKINS } from '../data/acts.js';

const { W, H, RAIL } = TABLE;
const FRAME = RAIL + 4;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = new BallSprites();
    this.fx = new FX();
    this.dpr = 1;
    this.cssW = 1; this.cssH = 1;
    this.zoom = 1; this.camX = W / 2; this.camY = H / 2;
    this.baseScale = 1;
    this.theme = null;
    this.cueSkin = CUE_SKINS.maple;
    this.sinking = [];
    this.time = 0;
    this.noise = null;
  }

  resize(cssW, cssH) {
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cssW = cssW; this.cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    const fw = W + FRAME * 2, fh = H + FRAME * 2;
    this.baseScale = Math.min(cssW / fw, cssH / fh) * 0.985;
    this.clampCam();
  }

  get scale() { return this.baseScale * this.zoom; }

  setTheme(theme, feltSkin = null, cueSkin = 'maple') {
    this.theme = { ...theme, ...(feltSkin || {}) };
    this.cueSkin = CUE_SKINS[cueSkin] || CUE_SKINS.maple;
    this.noise = null;
    this.stars = null;
  }

  // camera
  clampCam() {
    const s = this.scale;
    const halfW = this.cssW / 2 / s, halfH = this.cssH / 2 / s;
    const minX = -FRAME + halfW, maxX = W + FRAME - halfW;
    const minY = -FRAME + halfH, maxY = H + FRAME - halfH;
    this.camX = minX > maxX ? W / 2 : Math.max(minX, Math.min(maxX, this.camX));
    this.camY = minY > maxY ? H / 2 : Math.max(minY, Math.min(maxY, this.camY));
  }
  setZoom(z, cx = null, cy = null) {
    const nz = Math.max(1, Math.min(2.6, z));
    if (cx !== null) {
      const w = this.toWorld(cx, cy);
      this.zoom = nz;
      const s = this.scale;
      this.camX = w.x - (cx - this.cssW / 2) / s;
      this.camY = w.y - (cy - this.cssH / 2) / s;
    } else this.zoom = nz;
    this.clampCam();
  }
  pan(dx, dy) { this.camX -= dx / this.scale; this.camY -= dy / this.scale; this.clampCam(); }
  resetView() { this.zoom = 1; this.camX = W / 2; this.camY = H / 2; this.clampCam(); }
  toWorld(sx, sy) { const s = this.scale; return { x: (sx - this.cssW / 2) / s + this.camX, y: (sy - this.cssH / 2) / s + this.camY }; }
  toScreen(wx, wy) { const s = this.scale; return { x: (wx - this.camX) * s + this.cssW / 2, y: (wy - this.camY) * s + this.cssH / 2 }; }

  addSinking(ball, pocket) {
    this.sinking.push({ ball: { ...ball, q: ball.q.slice(), mods: { ...ball.mods } }, x: ball.x, y: ball.y, px: pocket.x, py: pocket.y, t: 0 });
  }

  // ─────────────────────────────────────────────────────────────

  draw(fight, view, dt) {
    this.time += dt;
    this.fx.update(dt);
    const ctx = this.ctx;
    const th = this.theme;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // background
    const g = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const s = this.scale;
    const sh = this.fx.shakeAmt;
    const sx = sh ? (Math.random() - 0.5) * sh : 0, sy = sh ? (Math.random() - 0.5) * sh : 0;
    const ox = this.cssW / 2 - this.camX * s + sx, oy = this.cssH / 2 - this.camY * s + sy;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);

    const sim = fight.sim;
    this.drawTable(ctx, sim, fight, view);
    this.drawFields(ctx, sim, fight);
    if (view.kitchen) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, HEAD_Y, W, H - HEAD_Y);
    }
    if (view.preview) this.drawPreview(ctx, view.preview);
    if (view.guide) this.drawGuide(ctx, view.guide, view);
    if (view.enemyGuide) this.drawGuide(ctx, view.enemyGuide, view, true);
    this.drawBalls(ctx, sim, fight, view, dt);
    if (view.cue) this.drawCue(ctx, view.cue);
    this.fx.draw(ctx, s);

    if (this.fx.flash) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = (this.fx.flash.life / this.fx.flash.max) * 0.35;
      ctx.fillStyle = this.fx.flash.color;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  feltNoise() {
    if (this.noise) return this.noise;
    const c = makeCanvas(96, 96), g = c.getContext('2d');
    const img = g.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 10;
    }
    g.putImageData(img, 0, 0);
    this.noise = this.ctx.createPattern(c, 'repeat');
    return this.noise;
  }

  drawTable(ctx, sim, fight, view) {
    const th = this.theme;
    const t = this.time;
    // rail frame
    ctx.save();
    if (th.neon) { ctx.shadowColor = th.railEdge; ctx.shadowBlur = 24; }
    roundRect(ctx, -RAIL, -RAIL, W + RAIL * 2, H + RAIL * 2, 30);
    const rg = ctx.createLinearGradient(-RAIL, 0, W + RAIL, 0);
    rg.addColorStop(0, th.rail[1]); rg.addColorStop(0.5, th.rail[0]); rg.addColorStop(1, th.rail[1]);
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = th.railEdge;
    roundRect(ctx, -RAIL + 1.5, -RAIL + 1.5, W + RAIL * 2 - 3, H + RAIL * 2 - 3, 29);
    ctx.stroke();
    // wood grain hint
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo(-RAIL + 6 + i * 5, -RAIL + 20); ctx.lineTo(-RAIL + 6 + i * 5, H + RAIL - 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W + RAIL - 6 - i * 5, -RAIL + 20); ctx.lineTo(W + RAIL - 6 - i * 5, H + RAIL - 20); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // diamonds
    ctx.fillStyle = th.diamond;
    const dm = (x, y) => { ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill(); };
    for (let i = 1; i < 4; i++) { dm((W * i) / 4, -RAIL / 2 - 2); dm((W * i) / 4, H + RAIL / 2 + 2); }
    for (let i = 1; i < 8; i++) { if (i === 4) continue; dm(-RAIL / 2 - 2, (H * i) / 8); dm(W + RAIL / 2 + 2, (H * i) / 8); }

    // felt
    const fg = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, H * 0.62);
    fg.addColorStop(0, th.felt[0]); fg.addColorStop(1, th.felt[1]);
    ctx.fillStyle = fg;
    ctx.fillRect(-12, -12, W + 24, H + 24);
    ctx.fillStyle = this.feltNoise();
    ctx.fillRect(-12, -12, W + 24, H + 24);
    if (th.stars) {
      if (!this.stars) this.stars = Array.from({ length: 70 }, () => [Math.random() * W, Math.random() * H, Math.random() * 1.4 + 0.3, Math.random() * 6]);
      for (const [x, y, r, p] of this.stars) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + p);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // head string + spot
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, HEAD_Y); ctx.lineTo(W, HEAD_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(FOOT_SPOT.x, FOOT_SPOT.y, 2.5, 0, Math.PI * 2); ctx.fill();

    // cushions (rubber strips) drawn outward from each rail segment
    const segs = sim.table.segs;
    ctx.fillStyle = th.cushion;
    for (const sg of segs) {
      if (sg.kind === 'wall') continue;
      const L = Math.sqrt(sg.len2);
      const ux = sg.dx / L, uy = sg.dy / L;
      // outward normal: away from table centre
      let nx = -uy, ny = ux;
      const mx = (sg.x1 + sg.x2) / 2, my = (sg.y1 + sg.y2) / 2;
      if ((mx + nx - W / 2) ** 2 + (my + ny - H / 2) ** 2 < (mx - W / 2) ** 2 + (my - H / 2) ** 2) { nx = -nx; ny = -ny; }
      const d = sg.kind === 'jaw' ? 7 : 13;
      ctx.beginPath();
      ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2);
      ctx.lineTo(sg.x2 + nx * d, sg.y2 + ny * d); ctx.lineTo(sg.x1 + nx * d, sg.y1 + ny * d);
      ctx.closePath(); ctx.fill();
    }
    // cushion nose highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.2;
    for (const sg of segs) {
      if (sg.kind === 'wall') continue;
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke();
    }

    // pockets
    for (const p of sim.table.pockets) {
      const pr = p.kind === 'hole' ? p.r + 4 : p.r + 8;
      if (p.kind === 'hole') {
        // swirling black hole
        const hg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, pr * 2.6);
        hg.addColorStop(0, '#000'); hg.addColorStop(0.35, '#000');
        hg.addColorStop(0.5, (p.glow || '#7c4dff') + 'aa'); hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(p.x, p.y, pr * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = (p.glow || '#b388ff');
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) {
          ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, pr * (1.2 + k * 0.45), t * (1.5 + k) , t * (1.5 + k) + 2.2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.fillStyle = th.pocket;
      ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, Math.PI * 2); ctx.fill();
      const pg = ctx.createRadialGradient(p.x, p.y, pr * 0.2, p.x, p.y, pr);
      pg.addColorStop(0, 'rgba(0,0,0,1)'); pg.addColorStop(1, 'rgba(40,30,20,0.6)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, Math.PI * 2); ctx.fill();
      if (p.glow) {
        ctx.save();
        ctx.shadowColor = p.glow; ctx.shadowBlur = 18;
        ctx.strokeStyle = p.glow;
        ctx.lineWidth = 3 + Math.sin(t * 5) * 1.2;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(p.x, p.y, pr + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    // walls
    for (const sg of segs) {
      if (sg.kind !== 'wall') continue;
      ctx.lineCap = 'round';
      ctx.strokeStyle = th.railEdge; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke();
      ctx.strokeStyle = th.rail[0]; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // bumpers
    for (const b of sim.table.bumpers) {
      if (b.eye) { this.drawEye(ctx, b, sim); continue; }
      const bg = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 2, b.x, b.y, b.r);
      bg.addColorStop(0, '#ff8a80'); bg.addColorStop(1, '#b71c1c');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1, 0, Math.PI * 2); ctx.stroke();
    }
    // moons
    for (const m of sim.movers) {
      const x = m.x ?? m.cx + Math.cos(m.phase) * m.rad, y = m.y ?? m.cy + Math.sin(m.phase) * m.rad;
      ctx.strokeStyle = 'rgba(179,136,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(m.cx, m.cy, m.rad, 0, Math.PI * 2); ctx.stroke();
      const mg = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, m.r);
      mg.addColorStop(0, '#eceff1'); mg.addColorStop(1, '#607d8b');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.arc(x + 4, y - 2, 3, 0, Math.PI * 2); ctx.arc(x - 3, y + 5, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawEye(ctx, b, sim) {
    const cue = sim.cue;
    ctx.fillStyle = '#fbe9e7';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4e342e'; ctx.lineWidth = 3; ctx.stroke();
    let dx = 0, dy = 0;
    if (cue && !cue.pocketed) { const d = Math.hypot(cue.x - b.x, cue.y - b.y) || 1; dx = ((cue.x - b.x) / d) * b.r * 0.35; dy = ((cue.y - b.y) / d) * b.r * 0.35; }
    ctx.fillStyle = '#c62828';
    ctx.beginPath(); ctx.arc(b.x + dx, b.y + dy, b.r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(b.x + dx, b.y + dy, b.r * 0.22, 0, Math.PI * 2); ctx.fill();
  }

  drawFields(ctx, sim, fight) {
    const t = this.time;
    // attracting pockets: inward-moving rings
    for (const p of sim.table.pockets) {
      if (!p.attract || p.kind === 'hole') continue;
      const col = p.glow || '#ff2bd6';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const ph = ((t * 0.6 + k / 3) % 1);
        ctx.globalAlpha = 0.35 * ph;
        ctx.beginPath(); ctx.arc(p.x, p.y, 20 + (1 - ph) * (p.attract.radius * 0.7), 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // drift arrows
    for (const f of fight.baseFields || []) {
      if (f.type !== 'drift') continue;
      const a = Math.atan2(f.ay, f.ax);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) {
        const x = W * (0.2 + i * 0.3), y = H * (0.12 + j * 0.19);
        const o = ((t * 20) % 30) - 15;
        ctx.save(); ctx.translate(x + Math.cos(a) * o, y + Math.sin(a) * o); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(0, 0); ctx.lineTo(-10, 7); ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawBalls(ctx, sim, fight, view, dt) {
    const s = this.scale * this.dpr;
    const t = this.time;
    // shadows
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    for (const b of sim.balls) {
      if (b.pocketed) continue;
      ctx.beginPath(); ctx.ellipse(b.x + b.r * 0.22, b.y + b.r * 0.32, b.r * 1.02, b.r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    }
    // sinking animation
    for (const sk of this.sinking) {
      sk.t += dt;
      const k = Math.min(1, sk.t / 0.28);
      const b = sk.ball;
      const x = sk.x + (sk.px - sk.x) * k, y = sk.y + (sk.py - sk.y) * k;
      const r = b.r * (1 - 0.45 * k);
      ctx.globalAlpha = 1 - k * 0.8;
      const spr = this.sprites.sprite(b, b.r * 2 * s);
      ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
    this.sinking = this.sinking.filter((sk) => sk.t < 0.28);

    for (const b of sim.balls) {
      if (b.pocketed) continue;
      const m = b.mods;
      if (m.fire) {
        const fl = 1 + Math.sin(t * 18 + b.id) * 0.12;
        const gg = ctx.createRadialGradient(b.x, b.y, b.r * 0.6, b.x, b.y, b.r * 2 * fl);
        gg.addColorStop(0, 'rgba(255,112,67,0.55)'); gg.addColorStop(1, 'rgba(255,112,67,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2 * fl, 0, Math.PI * 2); ctx.fill();
        if (Math.random() < 0.25) this.fx.embers(b.x, b.y - b.r * 0.5);
      }
      if (m.gold && Math.random() < 0.05) this.fx.sparkle(b.x, b.y);
      const spr = this.sprites.sprite(b, b.r * 2 * s);
      ctx.drawImage(spr, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      if (m.homing) {
        ctx.strokeStyle = 'rgba(0,229,255,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, t * 3, t * 3 + 4); ctx.stroke();
      }
      if (m.cluster) {
        ctx.fillStyle = `rgba(255,23,68,${0.5 + 0.5 * Math.sin(t * 8)})`;
        ctx.beginPath(); ctx.arc(b.x, b.y - b.r - 3, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      if (m.turncoat || (b.group === 'solid' && b.num > 8)) {
        ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2.5, 0, Math.PI * 2); ctx.stroke();
      }
      if (b.group === 'cue' && view.cueGlow) {
        ctx.strokeStyle = view.cueGlow; ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (b.group === 'cue' && view.ballInHand) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 9 + Math.sin(t * 4) * 2, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '16px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('✋', b.x, b.y - b.r - 16);
      }
      if (view.targetHint && view.targetHint.includes(b.group) && view.showTargets) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  drawGuide(ctx, g, view, enemy = false) {
    const col = enemy ? 'rgba(255,82,82,0.8)' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = col;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    g.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
    if (g.ghost) {
      const r = TABLE.R;
      const legal = !view.legalGroups || !g.hitBall || view.legalGroups.includes(g.hitBall.group);
      ctx.strokeStyle = legal ? col : 'rgba(255,82,82,0.95)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(g.ghost.x, g.ghost.y, r, 0, Math.PI * 2); ctx.stroke();
      if (!legal) {
        ctx.beginPath(); ctx.moveTo(g.ghost.x - 6, g.ghost.y - 6); ctx.lineTo(g.ghost.x + 6, g.ghost.y + 6);
        ctx.moveTo(g.ghost.x + 6, g.ghost.y - 6); ctx.lineTo(g.ghost.x - 6, g.ghost.y + 6); ctx.stroke();
      }
      if (g.objLine && legal) {
        ctx.strokeStyle = enemy ? 'rgba(255,138,128,0.9)' : 'rgba(255,241,118,0.95)';
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(g.objLine.x1, g.objLine.y1); ctx.lineTo(g.objLine.x2, g.objLine.y2); ctx.stroke();
      }
      if (g.cueLine) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(g.cueLine.x1, g.cueLine.y1); ctx.lineTo(g.cueLine.x2, g.cueLine.y2); ctx.stroke();
      }
    }
  }

  drawPreview(ctx, paths) {
    const colors = { cue: 'rgba(255,255,255,0.75)', solid: 'rgba(255,241,118,0.85)', stripe: 'rgba(255,138,128,0.8)', eight: 'rgba(200,200,200,0.8)' };
    ctx.lineWidth = 2;
    for (const id of Object.keys(paths)) {
      const p = paths[id];
      ctx.strokeStyle = colors[p.group] || '#fff';
      ctx.setLineDash(p.group === 'cue' ? [5, 5] : []);
      ctx.beginPath();
      p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      const last = p.pts[p.pts.length - 1];
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(last[0], last[1], p.pocketed ? 5 : TABLE.R * 0.9, 0, Math.PI * 2);
      if (p.pocketed) { ctx.fillStyle = ctx.strokeStyle; ctx.fill(); } else ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  drawCue(ctx, c) {
    // c: {x, y, angle, pull, alpha}
    const skin = this.cueSkin;
    ctx.save();
    ctx.globalAlpha = c.alpha ?? 1;
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle + Math.PI);
    const start = TABLE.R + 5 + c.pull;
    const L = 560;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.moveTo(start + 6, 6); ctx.lineTo(start + L + 6, 11); ctx.lineTo(start + L + 6, -1); ctx.closePath(); ctx.fill();
    // shaft
    const sg = ctx.createLinearGradient(0, -5, 0, 5);
    sg.addColorStop(0, skin.shaft[0]); sg.addColorStop(1, skin.shaft[1]);
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(start, -2.6); ctx.lineTo(start + L * 0.55, -4); ctx.lineTo(start + L * 0.55, 4); ctx.lineTo(start, 2.6); ctx.closePath(); ctx.fill();
    // butt
    const bg = ctx.createLinearGradient(0, -6, 0, 6);
    bg.addColorStop(0, skin.butt[0]); bg.addColorStop(1, skin.butt[1]);
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(start + L * 0.55, -4); ctx.lineTo(start + L, -6.5); ctx.lineTo(start + L, 6.5); ctx.lineTo(start + L * 0.55, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin.wrap;
    ctx.fillRect(start + L * 0.7, -5.2, L * 0.16, 10.4);
    ctx.fillStyle = skin.ring;
    ctx.fillRect(start + L * 0.55 - 2, -4.2, 4, 8.4);
    // ferrule + chalked tip
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(start, -2.6, 7, 5.2);
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(start - 2, -2.5, 2.5, 5);
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
