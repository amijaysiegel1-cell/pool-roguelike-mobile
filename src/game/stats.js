// Aggregates numeric modifiers from the character, items, ascension and
// challenge into a single stat block. Keys ending in "Mult"/"Scale" multiply,
// everything else adds.
import { ITEM_MAP } from '../data/items.js';
import { CHAR_MAP } from '../data/characters.js';
import { ASCENSION, CHALLENGE_MAP } from '../data/challenges.js';

export const STAT_DEFAULTS = {
  maxHp: 0, ballDmg: 0, dmgMult: 1, takenMult: 1, takenFlat: 0, coinMult: 1,
  pocketScale: 1, railBoost: 0, bankBonus: 0, comboBonus: 0, kickBonus: 0, longBonus: 0,
  breakMult: 1, handSize: 0, drawPerTurn: 0, charges: 0, healPerSink: 0, coinsPerSink: 0,
  powerMult: 1, finisherMult: 1, spinMult: 1, aimJitter: 0, hpPerShot: 0, foulMult: 1,
  scratchMult: 1, enemyFoulMult: 1, healAfterFight: 0, laser: 0, enemyHpMult: 1, enemyDmg: 0,
  eliteHpMult: 1, bossHpMult: 1, enemySkill: 0, shopMult: 1, restHealMult: 1, eightPenaltyMult: 1,
  gravityWell: 0, extraPocket: 0, stickyJaws: 0, slowmo: 0, lodestone: 0, eventHorizon: 0,
  revealMap: 0, seeEnemyAim: 0, guideBounces: 0, crystalEight: 0, noSpin: 0, banksOnly: 0,
  suddenDeath: 0, noShops: 0, bossRage: 0,
};

function isMul(k) { return /Mult$|Scale$/.test(k); }

export function mergeStats(target, src, times = 1) {
  if (!src) return target;
  for (const [k, v] of Object.entries(src)) {
    if (!(k in target)) target[k] = isMul(k) ? 1 : 0;
    if (isMul(k)) target[k] *= Math.pow(v, times);
    else target[k] += v * times;
  }
  return target;
}

export function computeStats(run) {
  const s = { ...STAT_DEFAULTS };
  const ch = CHAR_MAP[run.char];
  if (ch) mergeStats(s, ch.stats);
  for (const inst of run.items) {
    const def = ITEM_MAP[inst.id];
    if (def?.stats) mergeStats(s, def.stats, inst.n || 1);
  }
  for (let a = 1; a <= (run.ascension || 0); a++) mergeStats(s, ASCENSION[a]?.stats);
  if (run.challenge) mergeStats(s, CHALLENGE_MAP[run.challenge]?.stats);
  if (run.dailyMod) mergeStats(s, CHALLENGE_MAP[run.dailyMod]?.stats);
  if (run.bonusStats) mergeStats(s, run.bonusStats);
  return s;
}
