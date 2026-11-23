// Seeded, splittable RNG. Every random decision in a run comes from a stream
// derived from (seed, purpose) so the same seed always yields the same map,
// encounters, shops and loot — regardless of the order the player visits them.

export function hashStr(str) {
  // cyrb53-style 32-bit hash
  let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    this.s = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1;
  }
  next() {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); } // inclusive
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  gauss() {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  weighted(entries) {
    // entries: [[value, weight], ...]
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = this.next() * total;
    for (const [v, w] of entries) { r -= w; if (r <= 0) return v; }
    return entries[entries.length - 1][0];
  }
}

export function streamFor(seed, purpose) {
  return new RNG(hashStr(String(seed) + '|' + purpose));
}

const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomSeed() {
  let s = '';
  const buf = new Uint32Array(8);
  (globalThis.crypto || { getRandomValues: (b) => b.map(() => Math.random() * 2 ** 32) }).getRandomValues(buf);
  for (let i = 0; i < 8; i++) {
    s += SEED_ALPHABET[buf[i] % SEED_ALPHABET.length];
    if (i === 3) s += '-';
  }
  return s;
}

export function normalizeSeed(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
}
