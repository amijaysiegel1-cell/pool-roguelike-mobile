// Run lifecycle: creating runs, maps per act, node resolution, encounters,
// loot tables, shops, rewards, events and end-of-run bookkeeping.
// DOM-free; the UI screens call into these functions.
import { BALANCE, TABLE } from '../config.js';
import { streamFor } from '../core/rng.js';
import { generateMap, FLOORS } from './mapgen.js';
import { computeStats } from './stats.js';
import { ITEMS, ITEM_MAP } from '../data/items.js';
import { CARDS, CARD_MAP } from '../data/cards.js';
import { CHAR_MAP } from '../data/characters.js';
import { ENEMIES, ELITES, RIVAL, ACT_TABLE_MODS } from '../data/enemies.js';
import { BOSS_MAP, bossPool } from '../data/bosses.js';
import { EVENTS, EVENT_MAP } from '../data/events.js';
import { SHOPKEEPERS, BLACK_MARKET } from '../data/shops.js';
import { ASCENSION, CHALLENGE_MAP } from '../data/challenges.js';
import { isItemAvailable, runScore, legendPoints, addLeaderboard, checkCharUnlocks, checkAchievements } from './meta.js';
import { FOOT_SPOT } from '../physics/table.js';

const { W, H } = TABLE;
const STACKABLE = new Set(['explosive_tip', 'ghost_cue', 'double_shot', 'masse_cue', 'magnet_tip', 'stun_gun', 'chain_lightning', 'fire_balls', 'split_ball', 'gold_ball', 'homing_ball', 'cluster_bomb']);

export function createRun({ char = 'rookie', seed, ascension = 0, mode = 'normal', challenge = null, dailyMod = null }, profile) {
  const ch = CHAR_MAP[char];
  const run = {
    v: 1, seed, mode, challenge, dailyMod, ascension, char,
    hp: ch.hp, maxHp: ch.hp, maxHpBonus: 0, coins: 60,
    items: [], deck: ch.deck.slice(), consumables: [],
    act: 1, map: null, pos: null, visited: [], floorsCleared: 0,
    stats: { damage: 0, ballsSunk: 0, shots: 0, fouls: 0, coinsEarned: 0, fightsWon: 0, bossesBeaten: 0, bestHit: 0 },
    flags: {}, bossesMet: [], bonusStats: {}, eventsSeen: [], recentEnemies: [], removals: 0, rerolls: 0,
    screen: null, fight: null, startedAt: Date.now(),
  };
  for (const id of ch.items) giveItem(run, id, profile);
  for (const id of ch.consumables) giveItem(run, id, profile);
  const rng = streamFor(seed, 'start');
  const startCurses = (ASCENSION.slice(1, ascension + 1).some((a) => a?.startCurse) ? 1 : 0) + (CHALLENGE_MAP[challenge]?.startCurses || 0) + (CHALLENGE_MAP[dailyMod]?.startCurses || 0);
  for (let i = 0; i < startCurses; i++) { const c = rollItem(rng, run, profile, { types: ['curse'] }); if (c) giveItem(run, c.id, profile); }
  const legs = (CHALLENGE_MAP[challenge]?.startLegendary || 0) + (CHALLENGE_MAP[dailyMod]?.startLegendary || 0);
  for (let i = 0; i < legs; i++) { const c = rollItem(rng, run, profile, { types: ['relic'], rarity: 'legendary' }); if (c) giveItem(run, c.id, profile); }
  recalcMaxHp(run, true);
  startAct(run, 1);
  return run;
}

export function recalcMaxHp(run, fill = false) {
  const st = computeStats(run);
  const base = CHAR_MAP[run.char].hp;
  const newMax = Math.max(1, Math.round(base + st.maxHp + (run.maxHpBonus || 0)));
  const diff = newMax - run.maxHp;
  run.maxHp = newMax;
  if (fill) run.hp = newMax;
  else if (diff > 0) run.hp += diff;
  run.hp = Math.min(run.hp, run.maxHp);
  if (st.suddenDeath) { run.maxHp = 1; run.hp = Math.min(run.hp, 1) || 1; }
}

export function startAct(run, act) {
  run.act = act;
  const st = computeStats(run);
  const map = generateMap(streamFor(run.seed, 'map:' + act), act, { noShops: !!st.noShops });
  const pool = bossPool(act).filter((b) => !run.bossesMet.includes(b.id));
  const boss = (pool.length ? streamFor(run.seed, 'boss:' + act).pick(pool) : bossPool(act)[0]).id;
  run.map = { ...map, boss };
  run.pos = null;
  run.visited = [];
}

export function nodeById(run, id) { return run.map.nodes.find((n) => n.id === id); }

export function availableNodes(run) {
  if (!run.pos) return run.map.nodes.filter((n) => n.floor === 0);
  const cur = nodeById(run, run.pos);
  return cur ? cur.next.map((id) => nodeById(run, id)) : [];
}

/** Resolve what a node actually is (mystery nodes roll their real type). */
export function resolveNode(run, node) {
  const rng = streamFor(run.seed, 'node:' + node.id);
  let type = node.type;
  let black = false;
  if (type === 'mystery') {
    type = rng.weighted([['event', 52], ['fight', 20], ['treasure', 12], ['shop', computeStats(run).noShops ? 0 : 9], ['black', 7]]);
    if (type === 'black') { type = 'shop'; black = true; }
  } else if (type === 'shop' && rng.chance(0.08)) black = true;
  return { type, black };
}

export function enterNode(run, nodeId) {
  run.pos = nodeId;
  run.visited.push(nodeId);
  const node = nodeById(run, nodeId);
  return { node, ...resolveNode(run, node) };
}

// ───────────────────────── encounters ─────────────────────────

export function encounterFor(run, node, kind, special = null) {
  const act = run.act;
  const rng = streamFor(run.seed, 'enc:' + node.id + (special || ''));
  const enc = { key: node.id + (special || ''), kind, act, enemies: [], tableMods: [] };
  if (kind === 'boss') {
    const b = BOSS_MAP[run.map.boss];
    enc.boss = b.id;
    enc.enemies = b.enemies.map((e) => ({ ...e }));
    return enc;
  }
  if (special === 'rival') {
    const lvl = 0;
    enc.kind = 'elite';
    enc.rival = true;
    enc.enemies = [{ ...RIVAL, skill: Math.min(0.9, RIVAL.skill + 0.05 * act), hpMult: 1 + 0.12 * act, dmgBonus: Math.floor(act / 2) + lvl }];
    enc.tableMods = [];
    return enc;
  }
  const pool = kind === 'elite' ? ELITES.filter((e) => e.act === act) : ENEMIES.filter((e) => e.act === act);
  const fresh = pool.filter((e) => !run.recentEnemies.includes(e.id));
  const def = rng.pick(fresh.length ? fresh : pool);
  run.recentEnemies = [def.id, ...run.recentEnemies].slice(0, 3);
  enc.enemies = [{ ...def, hpRoll: rng.next() }];
  const floor = node.floor ?? 3;
  if (floor > 0 || kind === 'elite') {
    const mod = rng.weighted(ACT_TABLE_MODS[act]);
    if (mod !== 'none') enc.tableMods.push(mod);
  }
  if (special === 'fightclub') enc.tableMods = ['wall'];
  if (special === 'tournament') enc.coinMult = 2;
  if (special === 'fightclub') enc.bonusCoins = 60;
  return enc;
}

export function rivalEncounter(run, node, profile) {
  const lvl = profile.npc.rival.level;
  const enc = encounterFor(run, node, 'elite', 'rival');
  const e = enc.enemies[0];
  e.skill = Math.min(0.92, e.skill + 0.06 * lvl);
  e.hpMult = (e.hpMult || 1) * (1 + 0.15 * lvl);
  e.dmgBonus = (e.dmgBonus || 0) + lvl;
  e.name = `${RIVAL.name} Lv.${lvl + 1}`;
  return enc;
}

// ───────────────────────── loot ─────────────────────────

export function rollRarity(rng, act = 1, bonus = 0) {
  return rng.weighted([['common', 55 - act * 4 - bonus * 10], ['rare', 30 + act * 2], ['epic', 11 + act * 1.5 + bonus * 6], ['legendary', 3 + act * 0.6 + bonus * 4]]);
}

export function rollItem(rng, run, profile, { types, rarity = null, exclude = [], bonus = 0 }) {
  const owned = new Set(run.items.map((i) => i.id));
  let pool = ITEMS.filter((i) => types.includes(i.type) && i.rarity !== 'boss' && i.rarity !== 'starter' &&
    isItemAvailable(profile, i.id) && !exclude.includes(i.id) &&
    (i.type === 'consumable' || STACKABLE.has(i.id) || !owned.has(i.id)));
  if (!pool.length) return null;
  const notCurse = pool.filter((i) => i.type !== 'curse');
  if (!types.includes('curse') || types.length > 1) pool = notCurse.length ? notCurse : pool;
  let want = rarity;
  if (!want && pool.some((i) => i.rarity !== 'cursed')) want = rollRarity(rng, run.act, bonus);
  let sub = want ? pool.filter((i) => i.rarity === want) : pool;
  // fall back to neighbouring rarities
  const order = ['legendary', 'epic', 'rare', 'common'];
  let idx = order.indexOf(want);
  while (!sub.length && idx >= 0 && idx < order.length - 1) { idx++; sub = pool.filter((i) => i.rarity === order[idx]); }
  if (!sub.length) sub = pool;
  return rng.pick(sub);
}

export function rollCard(rng, rarity = null, act = 1) {
  const want = rarity || rng.weighted([['common', 60], ['rare', 32 + act * 2], ['epic', 8 + act * 2]]);
  const pool = CARDS.filter((c) => c.rarity === want);
  return rng.pick(pool.length ? pool : CARDS);
}

export function giveItem(run, id, profile = null) {
  const def = ITEM_MAP[id];
  if (!def) return null;
  if (profile) profile.seen.items[id] = true;
  if (def.type === 'consumable') {
    if (run.consumables.length < BALANCE.CONSUMABLE_SLOTS) run.consumables.push(id);
    return def;
  }
  const inst = run.items.find((i) => i.id === id);
  if (inst) inst.n = (inst.n || 1) + 1;
  else run.items.push({ id, n: 1 });
  recalcMaxHp(run);
  return def;
}

export function removeItem(run, id) {
  const i = run.items.findIndex((x) => x.id === id);
  if (i >= 0) run.items.splice(i, 1);
  recalcMaxHp(run);
}

export function giveCard(run, id, profile = null) {
  run.deck.push(id);
  if (profile) profile.seen.cards[id] = true;
  return CARD_MAP[id];
}

// ───────────────────────── rewards ─────────────────────────

export function fightRewards(run, enc, profile) {
  const rng = streamFor(run.seed, 'reward:' + enc.key);
  const act = enc.act;
  let coins;
  if (enc.kind === 'boss') coins = BALANCE.BOSS_COINS[act];
  else {
    const [a, b] = BALANCE.FIGHT_COINS[act];
    coins = rng.int(a, b);
    if (enc.kind === 'elite') coins = Math.round(coins * BALANCE.ELITE_COINS_MULT);
  }
  coins = Math.round(coins * (enc.coinMult || 1)) + (enc.bonusCoins || 0);
  const choices = [];
  const exclude = [];
  if (enc.kind === 'boss') {
    for (let i = 0; i < 3; i++) {
      const it = rollItem(rng, run, profile, { types: ['relic', 'cue', 'ball'], rarity: rng.pick(['rare', 'epic', 'epic', 'legendary']), exclude });
      if (it) { exclude.push(it.id); choices.push({ kind: 'item', id: it.id }); }
    }
  } else {
    const c1 = rollCard(rng, null, act), c2 = rollCard(rng, null, act);
    choices.push({ kind: 'card', id: c1.id });
    if (c2.id !== c1.id) choices.push({ kind: 'card', id: c2.id });
    const it = rollItem(rng, run, profile, { types: ['cue', 'ball', 'relic'], bonus: enc.kind === 'elite' ? 1 : 0 });
    if (it) choices.push({ kind: 'item', id: it.id });
  }
  let relic = null;
  if (enc.kind === 'elite') {
    const r = rollItem(rng, run, profile, { types: ['relic'], rarity: rng.pick(['rare', 'rare', 'epic', 'legendary']), exclude });
    if (r) relic = r.id;
  }
  if (enc.kind === 'boss') relic = BOSS_MAP[enc.boss].relic;
  let consumable = null;
  if (rng.chance(enc.kind === 'normal' ? 0.3 : 0.5)) consumable = rollItem(rng, run, profile, { types: ['consumable'] })?.id || null;
  return { coins, choices, relic, consumable };
}

export function treasureLoot(run, node, profile) {
  const rng = streamFor(run.seed, 'treasure:' + node.id);
  const st = computeStats(run);
  const n = st.noShops ? 2 : 1;
  const items = [];
  for (let i = 0; i < n; i++) {
    const it = rollItem(rng, run, profile, { types: ['relic'], bonus: 1, exclude: items });
    if (it) items.push(it.id);
  }
  return { items, coins: rng.int(25, 45) * n };
}

// ───────────────────────── shops ─────────────────────────

function priceFor(rng, rarity, mult, card = false) {
  const table = card ? BALANCE.CARD_PRICES : BALANCE.PRICES;
  const [a, b] = table[rarity] || table.rare || [60, 80];
  return Math.max(5, Math.round(rng.int(a, b) * mult));
}

export function makeShop(run, node, profile, black = false) {
  const rng = streamFor(run.seed, 'shop:' + node.id + ':' + (run.rerolls || 0));
  const keeper = black ? BLACK_MARKET : streamFor(run.seed, 'keeper:' + node.id).pick(SHOPKEEPERS);
  const st = computeStats(run);
  const mult = st.shopMult;
  const stock = [];
  const exclude = [];
  for (const [pool, count] of Object.entries(keeper.pools)) {
    for (let i = 0; i < count; i++) {
      let entry = null;
      if (pool === 'card') {
        const c = rollCard(rng, null, run.act);
        entry = { kind: 'card', id: c.id, price: priceFor(rng, c.rarity, mult, true) };
      } else {
        let types = [pool], rarity = null;
        if (pool === 'legendary') { types = ['relic', 'cue', 'ball']; rarity = 'legendary'; }
        if (pool === 'epic') { types = ['relic', 'cue', 'ball']; rarity = 'epic'; }
        const it = rollItem(rng, run, profile, { types, rarity, exclude });
        if (!it) continue;
        exclude.push(it.id);
        entry = { kind: 'item', id: it.id, price: priceFor(rng, it.rarity, mult) };
        if (it.type === 'consumable') entry.price = Math.round(entry.price * 0.55);
      }
      if (black) entry.hpPrice = Math.max(6, Math.round(entry.price / 7));
      stock.push(entry);
    }
  }
  if (stock.length && rng.chance(0.75)) {
    const s = rng.pick(stock);
    s.sale = true;
    s.price = Math.round(s.price * 0.5);
  }
  const healAmt = Math.round(run.maxHp * 0.25);
  return {
    keeper: keeper.id, black, stock,
    healCost: Math.round((28 + run.act * 6) * mult), healAmt, healed: false,
    removeCost: Math.round((BALANCE.REMOVE_BASE + 25 * (run.removals || 0)) * mult), removed: false,
    rerollCost: BALANCE.REROLL_BASE + 8 * (run.rerolls || 0),
    line: rng.pick(keeper.lines),
  };
}

// ───────────────────────── events ─────────────────────────

export function pickEvent(run, node, profile) {
  const rng = streamFor(run.seed, 'event:' + node.id);
  const pool = EVENTS.filter((e) => e.acts.includes(run.act) && !run.eventsSeen.includes(e.id));
  const weighted = pool.map((e) => [e.id, e.npc ? 1.6 : 1]);
  const id = weighted.length ? rng.weighted(weighted) : 'side_bet';
  run.eventsSeen.push(id);
  profile.seen.events[id] = true;
  return EVENT_MAP[id];
}

export function makeEventCtx(run, profile, rng) {
  const ctx = {
    run, profile, rng,
    def: (id) => ITEM_MAP[id],
    coins: (n) => { run.coins = Math.max(0, run.coins + n); },
    hurt: (n) => { run.hp = Math.max(1, run.hp - n); },
    heal: (n) => { if (!computeStats(run).suddenDeath) run.hp = Math.min(run.maxHp, run.hp + n); },
    maxHp: (n) => { run.maxHpBonus = (run.maxHpBonus || 0) + n; recalcMaxHp(run); },
    bonus: (stats) => { for (const [k, v] of Object.entries(stats)) run.bonusStats[k] = (run.bonusStats[k] || 0) + v; },
    randomItem: ({ types, rarity }) => {
      const it = rollItem(rng, run, profile, { types, rarity });
      if (it) giveItem(run, it.id, profile);
      return it || { name: 'nothing' };
    },
    giveItem: (id) => giveItem(run, id, profile),
    addCurse: () => { const c = rollItem(rng, run, profile, { types: ['curse'] }); if (c) giveItem(run, c.id, profile); return c || { name: 'nothing' }; },
    removeRandom: (types) => {
      const owned = run.items.filter((i) => types.includes(ITEM_MAP[i.id]?.type) && ITEM_MAP[i.id].rarity !== 'boss');
      if (!owned.length) return null;
      const inst = rng.pick(owned);
      removeItem(run, inst.id);
      return ITEM_MAP[inst.id];
    },
    randomCard: (rarity) => { const c = rollCard(rng, rarity, run.act); giveCard(run, c.id, profile); return c; },
    removeCard: () => { const i = rng.int(0, run.deck.length - 1); const id = run.deck.splice(i, 1)[0]; return CARD_MAP[id]?.name || id; },
    giveConsumable: (id) => giveItem(run, id, profile),
    unlockItem: (id) => { if (!profile.unlocked.items.includes(id)) profile.unlocked.items.push(id); },
    seeNpc: (id) => { profile.seen.npcs[id] = true; },
  };
  return ctx;
}

// ───────────────────────── side games ─────────────────────────

export function raccoonScenario(run, nodeId) {
  const rng = streamFor(run.seed, 'raccoon:' + nodeId);
  const pocketsXY = [[0, 0], [W, 0], [0, H], [W, H], [0, H / 2], [W, H / 2]];
  const [px, py] = rng.pick(pocketsXY);
  const target = rng.int(1, 7);
  // place target on a line from the pocket into the table
  const ang = Math.atan2(H / 2 - py + rng.range(-200, 200), W / 2 - px + rng.range(-120, 120));
  const d1 = rng.range(120, 300);
  const tx = clampX(px + Math.cos(ang) * d1), ty = clampY(py + Math.sin(ang) * d1);
  const off = rng.range(-0.55, 0.55);
  const d2 = rng.range(160, 330);
  const cx = clampX(tx + Math.cos(ang + off) * d2), cy = clampY(ty + Math.sin(ang + off) * d2);
  const balls = [{ num: target, x: tx, y: ty }];
  const blockers = rng.int(1, 3);
  for (let i = 0; i < blockers * 6 && balls.length < blockers + 1; i++) {
    const bx = rng.range(40, W - 40), by = rng.range(60, H - 60);
    if (Math.hypot(bx - tx, by - ty) < 70 || Math.hypot(bx - cx, by - cy) < 70) continue;
    if (segDist(bx, by, cx, cy, tx, ty) < 40 || segDist(bx, by, tx, ty, px, py) < 40) continue;
    balls.push({ num: 9 + i % 7, x: bx, y: by });
  }
  return { goal: 'target', target, maxShots: 2, resetOnMiss: true, balls, cue: { x: cx, y: cy } };
}

function clampX(x) { return Math.max(40, Math.min(W - 40, x)); }
function clampY(y) { return Math.max(40, Math.min(H - 40, y)); }
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / L; t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

// ───────────────────────── end of run ─────────────────────────

export function chooseEnding(run, fightFlags) {
  if (fightFlags?.lastBlowEight) return 'eight_within';
  if (run.items.some((i) => i.id === 'old_chalkys_cue')) return 'mentor';
  if ((run.flags.raccoonWins || 0) >= 2) return 'raccoon';
  return 'normal';
}

export const ENDINGS = {
  normal: { title: 'Champion of the Cosmos', icon: '🏆', text: 'The Cosmic 8 cracks like an egg. Inside: nothing but a cue ball, spinning gently. The arena is silent. Then — applause, from somewhere very, very far away.\n\nYou are the greatest player in the universe. For now.' },
  eight_within: { title: 'The 8 Within', icon: '🎱', secret: true, text: 'Your final shot sinks the 8. The Cosmic 8 doesn\'t shatter — it smiles.\n\n"YOU UNDERSTAND NOW. EVERY RACK ENDS WITH THE 8. EVERY STORY ENDS WITH A POCKET."\n\nYou look down. Your hands are black, glossy, perfectly round.\n\nThe next challenger is already racking up.' },
  mentor: { title: 'The Legend Returns', icon: '👴', secret: true, text: 'Old Chalky\'s cue hums as the Cosmic 8 falls. Back on Earth, in a dive bar that smells like old beer, an old man looks up from his drink and smiles.\n\n"Told you it\'d do it again, kid."' },
  raccoon: { title: 'Raccoon King', icon: '🦝', secret: true, text: 'As the Cosmic 8 collapses, a small figure scurries out of your coin purse, dragging the entire cosmic prize pool behind him.\n\nBandit tips a tiny crown. "Partners," he chitters.\n\nYou never see your winnings again. You don\'t mind.' },
};

/** Update the profile after a run ends. Returns a summary for the UI. */
export function finishRun(run, profile, won, endingId = null) {
  const score = runScore(run, won);
  const lp = legendPoints(run, won);
  profile.lp += lp;
  profile.lpTotal += lp;
  profile.stats.runs++;
  if (won) profile.stats.wins++; else profile.stats.deaths++;
  profile.stats.ballsSunk += run.stats.ballsSunk;
  profile.stats.damage += run.stats.damage;
  const floor = (run.act - 1) * (FLOORS + 1) + run.visited.length;
  profile.stats.bestFloor = Math.max(profile.stats.bestFloor, floor);
  let newAsc = false;
  if (won && run.ascension >= profile.ascension && profile.ascension < ASCENSION.length - 1) { profile.ascension = run.ascension + 1; newAsc = true; }
  if (endingId) profile.seen.endings[endingId] = true;
  const entry = { score, char: run.char, seed: run.seed, mode: run.mode, challenge: run.challenge, asc: run.ascension, won, act: run.act, date: Date.now() };
  addLeaderboard(profile, entry);
  if (run.mode === 'daily') {
    const k = run.dailyKey;
    profile.daily[k] = Math.max(profile.daily[k] || 0, score);
  }
  const ach = checkAchievements(profile, 'runEnd', { run, won });
  const chars = checkCharUnlocks(profile);
  return { score, lp, newAsc, achievements: ach, chars, entry };
}
