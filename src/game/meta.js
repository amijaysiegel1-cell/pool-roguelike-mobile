// Meta-progression: the persistent profile (unlocks, Legend Points, NPC memory,
// collection book, achievements, leaderboards, settings).
import { storage } from '../core/save.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { CHARACTERS } from '../data/characters.js';

export const CLUBHOUSE = [
  // relics & powerups added to the loot pool
  { id: 'item:double_shot', kind: 'item', ref: 'double_shot', cost: 30 },
  { id: 'item:gravity_well', kind: 'item', ref: 'gravity_well', cost: 30 },
  { id: 'item:chain_lightning', kind: 'item', ref: 'chain_lightning', cost: 35 },
  { id: 'item:homing_ball', kind: 'item', ref: 'homing_ball', cost: 35 },
  { id: 'item:cluster_bomb', kind: 'item', ref: 'cluster_bomb', cost: 35 },
  { id: 'item:turncoat', kind: 'item', ref: 'turncoat', cost: 30 },
  { id: 'item:spin_doctor', kind: 'item', ref: 'spin_doctor', cost: 20 },
  { id: 'item:piggy_bank', kind: 'item', ref: 'piggy_bank', cost: 20 },
  { id: 'item:overtime', kind: 'item', ref: 'overtime', cost: 30 },
  { id: 'item:trick_shot_trophy', kind: 'item', ref: 'trick_shot_trophy', cost: 35 },
  { id: 'item:crown_of_cues', kind: 'item', ref: 'crown_of_cues', cost: 50 },
  { id: 'item:midas_touch', kind: 'item', ref: 'midas_touch', cost: 50 },
  // cosmetics
  { id: 'felt:royal', kind: 'felt', ref: 'royal', cost: 15, name: 'Royal Blue Felt', icon: '🟦' },
  { id: 'felt:crimson', kind: 'felt', ref: 'crimson', cost: 15, name: 'Crimson Felt', icon: '🟥' },
  { id: 'felt:mint', kind: 'felt', ref: 'mint', cost: 15, name: 'Mint Felt', icon: '🟩' },
  { id: 'felt:midnight', kind: 'felt', ref: 'midnight', cost: 25, name: 'Midnight Felt', icon: '⬛' },
  { id: 'felt:gold', kind: 'felt', ref: 'gold', cost: 40, name: 'Gold Leaf Felt', icon: '🟨' },
  { id: 'cue:carbon', kind: 'cue', ref: 'carbon', cost: 20, name: 'Carbon Cue', icon: '🖤' },
  { id: 'cue:neon', kind: 'cue', ref: 'neon', cost: 30, name: 'Neon Cue', icon: '💜' },
  { id: 'cue:ghost', kind: 'cue', ref: 'ghost', cost: 35, name: 'Ghost Cue Skin', icon: '🤍' },
  { id: 'cue:dragon', kind: 'cue', ref: 'dragon', cost: 45, name: 'Dragon Cue', icon: '🐉' },
];

// Items that only drop once unlocked (Clubhouse purchase or quest).
export const LOCKED_ITEMS = new Set([
  ...CLUBHOUSE.filter((c) => c.kind === 'item').map((c) => c.ref),
  'oracle_eye', 'old_chalkys_cue', 'crystal_eight', 'raccoon_paw',
]);

export function defaultProfile() {
  return {
    v: 1,
    lp: 0, lpTotal: 0,
    unlocked: { chars: ['rookie'], items: [], felts: ['default'], cues: ['maple'], clubhouse: [] },
    ascension: 0,
    stats: { runs: 0, wins: 0, bestFloor: 0, ballsSunk: 0, damage: 0, bosses: {}, deaths: 0, fights: 0 },
    seen: { items: {}, cards: {}, bosses: {}, enemies: {}, chars: { rookie: true }, npcs: {}, events: {}, endings: {} },
    achievements: {},
    npc: { mentor: { met: 0 }, rival: { level: 0, wins: 0, losses: 0 }, oracle: { asks: 0 }, raccoon: { beaten: 0, robbed: 0 } },
    flags: { tutorialDone: false, reachAct2: false, beatAct1: false, beatAct2: false, raccoonFriend: false },
    daily: {},
    leaderboard: [],
    settings: { sfx: 0.8, music: 0.5, haptics: true, guide: true, felt: 'default', cue: 'maple', leftHanded: false },
  };
}

export function loadProfile() {
  const p = storage.load('profile');
  const d = defaultProfile();
  if (!p) return d;
  // shallow-merge new fields into old saves
  const merged = { ...d, ...p };
  for (const k of ['unlocked', 'stats', 'seen', 'npc', 'flags', 'settings']) merged[k] = { ...d[k], ...(p[k] || {}) };
  for (const k of Object.keys(d.npc)) merged.npc[k] = { ...d.npc[k], ...(p.npc?.[k] || {}) };
  for (const k of Object.keys(d.seen)) merged.seen[k] = { ...d.seen[k], ...(p.seen?.[k] || {}) };
  for (const k of Object.keys(d.unlocked)) merged.unlocked[k] = p.unlocked?.[k] || d.unlocked[k];
  return merged;
}

export function saveProfile(p) { storage.save('profile', p); }

export function isItemAvailable(profile, id) {
  return !LOCKED_ITEMS.has(id) || profile.unlocked.items.includes(id);
}

/** Re-evaluate character unlocks. Returns newly unlocked character ids. */
export function checkCharUnlocks(profile) {
  const out = [];
  for (const c of CHARACTERS) {
    if (!c.unlock || profile.unlocked.chars.includes(c.id)) continue;
    const k = c.unlock.key;
    const ok = (k === 'tutorial' && profile.flags.tutorialDone) || (k === 'reachAct2' && profile.flags.reachAct2) ||
      (k === 'beatAct1' && profile.flags.beatAct1) || (k === 'beatAct2' && profile.flags.beatAct2) ||
      (k === 'raccoonFriend' && profile.npc.raccoon.beaten >= 3);
    if (ok) { profile.unlocked.chars.push(c.id); profile.seen.chars[c.id] = true; out.push(c); }
  }
  return out;
}

/** Check achievements for a trigger. Returns newly earned achievements. */
export function checkAchievements(profile, on, ctx) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements[a.id]) continue;
    if (a.on !== on && a.on !== 'profile') continue;
    let ok = false;
    try { ok = a.test({ profile, ...ctx }); } catch { ok = false; }
    if (ok) { profile.achievements[a.id] = Date.now(); out.push(a); }
  }
  return out;
}

export function runScore(run, won) {
  const s = run.stats;
  return Math.round(
    (run.floorsCleared || 0) * 50 + (s.bossesBeaten || 0) * 400 + s.damage * 0.5 + run.coins * 0.5 +
    (won ? 2000 : 0) + (run.ascension || 0) * 300 + (run.hp || 0) * 2,
  );
}

export function legendPoints(run, won) {
  return Math.round((run.floorsCleared || 0) * 2 + (run.stats.bossesBeaten || 0) * 15 + (won ? 50 : 0) + (run.ascension || 0) * 10);
}

export function addLeaderboard(profile, entry) {
  profile.leaderboard.push(entry);
  profile.leaderboard.sort((a, b) => b.score - a.score);
  profile.leaderboard = profile.leaderboard.slice(0, 50);
}

// Optional global leaderboard hook. Set window.CUELIKE_LEADERBOARD_URL to an
// endpoint accepting POST {name, score, seed, mode, char, date} to enable.
export async function submitGlobalScore(entry) {
  const url = globalThis.CUELIKE_LEADERBOARD_URL;
  if (!url) return { ok: false, reason: 'No global leaderboard configured' };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
    return { ok: r.ok };
  } catch (e) { return { ok: false, reason: String(e) }; }
}
