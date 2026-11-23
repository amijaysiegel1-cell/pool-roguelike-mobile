export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const len = (x, y) => Math.sqrt(x * x + y * y);
export const TAU = Math.PI * 2;
export const sign = (v) => (v < 0 ? -1 : 1);

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function todayKey(d = new Date()) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// --- quaternion helpers for ball orientation (w, x, y, z) ---
export function quatMulAxisAngle(q, ax, ay, az, angle) {
  // returns dq * q where dq rotates by angle around unit axis (ax,ay,az)
  const h = angle * 0.5, s = Math.sin(h);
  const dw = Math.cos(h), dx = ax * s, dy = ay * s, dz = az * s;
  const [w, x, y, z] = q;
  q[0] = dw * w - dx * x - dy * y - dz * z;
  q[1] = dw * x + dx * w + dy * z - dz * y;
  q[2] = dw * y - dx * z + dy * w + dz * x;
  q[3] = dw * z + dx * y - dy * x + dz * w;
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= n; q[1] /= n; q[2] /= n; q[3] /= n;
}

export function quatToMat(q, m) {
  const [w, x, y, z] = q;
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - w * z); m[2] = 2 * (x * z + w * y);
  m[3] = 2 * (x * y + w * z); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - w * x);
  m[6] = 2 * (x * z - w * y); m[7] = 2 * (y * z + w * x); m[8] = 1 - 2 * (x * x + y * y);
  return m;
}
