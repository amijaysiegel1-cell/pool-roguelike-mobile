// All audio is synthesized with WebAudio — no asset downloads.
// SFX: ball clacks, cushions, pockets, cue strikes, UI, combat stings.
// Music: a small step sequencer with per-act styles and intensity layers
// (0 = calm map, 1 = fight, 2 = boss, 3 = boss phase 2).

const SCALES = {
  blues: [0, 3, 5, 6, 7, 10], minor: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
};
const PROG = {
  shuffle: [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7],
  synth: [0, 8, 3, 10],
  techno: [0, 0, 1, 0],
  cosmic: [0, 5, 10, 7],
  lounge: [0, 5, 2, 7],
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musicVol = 0.45;
    this.muted = false;
    this.style = null;
    this.intensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.lastClack = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -14;
    this.master.ratio.value = 4;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.connect(this.master);
    this.applyVolumes();
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.pendingMusic) { const [s, i] = this.pendingMusic; this.pendingMusic = null; this.music(s, i); }
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.sfx.gain.value = this.muted ? 0 : this.sfxVol;
    this.mus.gain.value = this.muted ? 0 : this.musicVol * 0.55;
  }
  setVolumes(sfx, music) { this.sfxVol = sfx; this.musicVol = music; this.applyVolumes(); }

  // ── primitives ──
  tone(type, f0, f1, dur, vol, when = 0, dest = this.sfx, attack = 0.002) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, filter = 'bandpass', freq = 2000, q = 1, when = 0, dest = this.sfx, f1 = null) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = filter; fl.frequency.setValueAtTime(freq, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  // ── SFX ──
  clack(impact) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastClack < 0.012) return;
    this.lastClack = now;
    const v = Math.min(1, impact / 1600) * 0.9 + 0.05;
    const p = 0.94 + Math.random() * 0.12;
    this.tone('sine', 2500 * p, 2300 * p, 0.05, v * 0.55);
    this.tone('triangle', 3900 * p, 3600 * p, 0.035, v * 0.3);
    this.noise(0.025, v * 0.5, 'bandpass', 3200, 1.4);
  }
  cushion(impact) {
    const v = Math.min(1, impact / 1800) * 0.7 + 0.04;
    this.noise(0.09, v * 0.6, 'lowpass', 420, 0.8);
    this.tone('sine', 95, 70, 0.09, v * 0.5);
  }
  pocket() {
    this.tone('sine', 170, 55, 0.22, 0.6);
    this.noise(0.05, 0.35, 'bandpass', 1500, 2, 0.05);
    this.noise(0.04, 0.25, 'bandpass', 1200, 2, 0.1);
    this.noise(0.04, 0.18, 'bandpass', 900, 2, 0.16);
  }
  cue(power) {
    const v = 0.25 + power * 0.6;
    this.tone('triangle', 1150, 900, 0.035, v * 0.5);
    this.noise(0.03, v * 0.5, 'bandpass', 2200, 1);
    this.tone('sine', 140, 90, 0.06, v * 0.4);
  }
  coin() { this.tone('square', 1318, 1318, 0.06, 0.08); this.tone('square', 1760, 1760, 0.12, 0.08, 0.06); }
  hurt() { this.tone('sawtooth', 160, 60, 0.25, 0.35); this.noise(0.15, 0.3, 'lowpass', 900, 1); }
  hit(big = false) { this.tone('sine', big ? 700 : 560, big ? 180 : 260, big ? 0.22 : 0.12, 0.35); this.noise(0.06, 0.25, 'highpass', 2500, 1); }
  explode() { this.noise(0.7, 0.9, 'lowpass', 1400, 0.7, 0, this.sfx, 90); this.tone('sine', 70, 35, 0.5, 0.7); }
  zap() { for (let i = 0; i < 5; i++) this.tone('sawtooth', 900 + Math.random() * 1600, 300, 0.05, 0.12, i * 0.025); }
  ghost() { this.tone('sine', 900, 300, 0.4, 0.18); this.tone('sine', 1200, 400, 0.4, 0.1, 0.05); }
  ui() { this.tone('triangle', 880, 880, 0.04, 0.12); }
  tap() { this.tone('sine', 660, 660, 0.03, 0.08); }
  card() { this.noise(0.08, 0.25, 'highpass', 3000, 0.7); this.tone('triangle', 1046, 1568, 0.08, 0.1); }
  heal() { [523, 659, 784].forEach((f, i) => this.tone('sine', f, f, 0.18, 0.14, i * 0.07)); }
  combo(n) { const base = 523; [0, 4, 7, 12, 16, 19].slice(0, Math.min(6, n + 2)).forEach((s, i) => this.tone('triangle', base * Math.pow(2, s / 12), 0, 0.14, 0.18, i * 0.06)); }
  buy() { this.coin(); this.tone('triangle', 1568, 2093, 0.15, 0.1, 0.1); }
  error() { this.tone('square', 220, 180, 0.12, 0.12); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.2, i * 0.11)); }
  lose() { [392, 349, 311, 262].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.35, 0.2, i * 0.18)); }
  phase() { this.tone('sawtooth', 110, 55, 1.2, 0.35); this.noise(1.0, 0.4, 'lowpass', 600, 1, 0, this.sfx, 60); }
  bossIntro() { [0, 3, 7, 6].forEach((s, i) => this.tone('sawtooth', 110 * Math.pow(2, s / 12), 0, 0.5, 0.18, i * 0.25)); }
  chest() { [784, 988, 1175, 1568].forEach((f, i) => this.tone('sine', f, f, 0.25, 0.15, i * 0.08)); }

  // ── music ──
  music(style, intensity = 0) {
    if (!this.ctx) { this.pendingMusic = [style, intensity]; return; }
    if (!style) { this.stopMusic(); return; }
    const changed = !this.style || this.style.style !== style.style || this.style.root !== style.root;
    this.style = style;
    this.intensity = intensity;
    if (changed) { this.step = 0; this.nextTime = this.ctx.currentTime + 0.1; }
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 50);
  }
  setIntensity(i) { this.intensity = i; }
  stopMusic() { clearInterval(this.timer); this.timer = null; this.style = null; }

  schedule() {
    const c = this.ctx;
    if (!c || !this.style) return;
    const st = this.style;
    const bpm = st.bpm * (this.intensity >= 3 ? 1.08 : 1);
    const stepDur = 60 / bpm / 4;
    while (this.nextTime < c.currentTime + 0.15) {
      const when = this.nextTime - c.currentTime;
      this.playStep(this.step, Math.max(0, when), stepDur);
      let d = stepDur;
      if (st.style === 'shuffle' || st.style === 'lounge') d = stepDur * (this.step % 2 === 0 ? 1.33 : 0.67);
      this.nextTime += d;
      this.step++;
    }
  }

  playStep(step, when, sd) {
    const st = this.style, I = this.intensity, m = this.mus;
    const prog = PROG[st.style] || PROG.lounge;
    const bar = Math.floor(step / 16) % prog.length;
    const s16 = step % 16;
    const root = st.root + prog[bar];
    const scale = SCALES[st.scale] || SCALES.minor;
    const drums = I >= 1;
    switch (st.style) {
      case 'shuffle':
      case 'lounge': {
        if (s16 % 4 === 0) this.tone('triangle', mtof(root - 12 + [0, 4, 7, 9][(s16 / 4) | 0]), 0, sd * 3.5, 0.22, when, m);
        if (s16 % 8 === 4) for (const iv of [4, 10, 14]) this.tone('triangle', mtof(root + 12 + iv), 0, sd * 2, 0.05, when, m);
        if (drums) {
          if (s16 === 0 || s16 === 8) this.kick(when);
          if (s16 === 4 || s16 === 12) this.snare(when, 0.18);
          if (s16 % 2 === 0) this.hat(when, 0.05);
        }
        if (I >= 2 && s16 % 2 === 0 && Math.random() < 0.55) this.tone('square', mtof(root + 24 + scale[(Math.random() * scale.length) | 0]), 0, sd * 1.5, 0.04, when, m);
        break;
      }
      case 'synth': {
        const minor = bar === 0;
        const chord = minor ? [0, 3, 7, 12] : [0, 4, 7, 12];
        if (s16 % 2 === 0) this.tone('sawtooth', mtof(root - 12 + (s16 % 4 === 0 ? 0 : 12)), 0, sd * 1.6, 0.09, when, m);
        if (I >= 1 || s16 % 4 === 0) this.tone('square', mtof(root + 12 + chord[s16 % 4]), 0, sd * 0.9, 0.035, when, m);
        if (s16 === 0) for (const iv of chord.slice(0, 3)) this.tone('triangle', mtof(root + iv), 0, sd * 15, 0.035, when, m, 0.2);
        if (drums) {
          if (s16 % 4 === 0) this.kick(when);
          if (s16 % 4 === 2) this.hat(when, 0.07, true);
          if (s16 === 4 || s16 === 12) this.snare(when, 0.12);
        }
        if (I >= 2 && s16 % 2 === 1) this.tone('square', mtof(root + 24 + chord[(s16 >> 1) % 4]), 0, sd * 0.7, 0.03, when, m);
        break;
      }
      case 'techno': {
        if (drums || s16 % 8 === 0) { if (s16 % 4 === 0) this.kick(when, 0.9); }
        if (s16 % 2 === 1 || I >= 2) this.tone('sawtooth', mtof(root - 12 + (s16 % 8 === 3 ? 1 : 0)), 0, sd * 0.8, 0.1, when, m);
        if (drums && (s16 === 4 || s16 === 12)) this.clap(when);
        if (drums && s16 % 2 === 0) this.hat(when, 0.04);
        if (s16 === 0) this.tone('triangle', mtof(root + 12), 0, sd * 14, 0.04, when, m, 0.4);
        if (I >= 2 && s16 % 4 === 3) this.tone('square', mtof(root + 24 + scale[(step >> 2) % scale.length]), 0, sd, 0.03, when, m);
        break;
      }
      case 'cosmic': {
        if (s16 === 0) for (const iv of [0, 7, 14]) { this.tone('sine', mtof(root + iv), 0, sd * 16, 0.06, when, m, 0.6); this.tone('sine', mtof(root + iv) * 1.004, 0, sd * 16, 0.04, when, m, 0.6); }
        if (s16 % 6 === 0 || (I >= 2 && s16 % 3 === 0)) this.tone('sine', mtof(root + 24 + scale[(step * 3) % scale.length]), 0, sd * 8, 0.05, when, m);
        if (drums && s16 % 8 === 0) this.kick(when, 0.6);
        if (I >= 2 && s16 % 4 === 2) this.hat(when, 0.04);
        if (s16 % 4 === 0) this.tone('sine', mtof(root - 12), 0, sd * 3.5, 0.12, when, m);
        break;
      }
      default: break;
    }
  }
  kick(when, v = 0.7) { this.tone('sine', 150, 45, 0.22, v * 0.6, when, this.mus); }
  snare(when, v) { this.noise(0.12, v, 'highpass', 1600, 0.8, when, this.mus); this.tone('triangle', 190, 160, 0.08, v * 0.6, when, this.mus); }
  hat(when, v, open = false) { this.noise(open ? 0.1 : 0.03, v, 'highpass', 7000, 0.8, when, this.mus); }
  clap(when) { for (let i = 0; i < 3; i++) this.noise(0.05, 0.12, 'bandpass', 1400, 1.2, when + i * 0.011, this.mus); }
}

export const audio = new AudioEngine();
