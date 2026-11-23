// Haptic feedback. Uses the Vibration API where available (Android Chrome,
// most Android browsers). iOS Safari does not expose vibration to web pages, so
// these calls are silent no-ops there; a native wrapper (Capacitor Haptics)
// can be dropped in behind this same interface.

let enabled = true;
let last = 0;

export const haptics = {
  setEnabled(v) { enabled = !!v; },
  pulse(ms = 10) {
    if (!enabled || !globalThis.navigator?.vibrate) return;
    const now = Date.now();
    if (now - last < 25) return;
    last = now;
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  },
  pattern(p) { if (enabled && globalThis.navigator?.vibrate) try { navigator.vibrate(p); } catch { /* ignore */ } },
  hit(impact) { this.pulse(Math.min(28, 6 + impact / 120)); },
  sink() { this.pattern([18, 30, 12]); },
  cue(power) { this.pulse(10 + power * 25); },
  hurt() { this.pattern([40, 40, 60]); },
  big() { this.pattern([30, 20, 60, 20, 90]); },
  tick() { this.pulse(4); },
};
