// localStorage persistence with graceful failure (private mode, quota...).
const PREFIX = 'cuelike.';

export const storage = {
  load(key, fallback = null) {
    try {
      const raw = globalThis.localStorage?.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  save(key, value) {
    try { globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) {
    try { globalThis.localStorage?.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
};
