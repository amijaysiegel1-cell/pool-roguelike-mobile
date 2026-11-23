// 8-ball rules, adapted for combat. Pure functions — no DOM, no side effects.
//
// Groups are fixed per rack (the player is always solids, the opponent stripes)
// so ball modifiers can be applied the moment a rack is set.
import { BALANCE } from '../config.js';

export function groupOf(side) { return side === 'player' ? 'solid' : 'stripe'; }

export function remaining(sim, group) {
  let n = 0;
  for (const b of sim.balls) if (!b.pocketed && b.group === group) n++;
  return n;
}

/** Which ball groups may legally be hit first. */
export function legalTargets(sim, side, isBreak) {
  if (isBreak) return ['solid', 'stripe', 'eight'];
  const g = groupOf(side);
  return remaining(sim, g) > 0 ? [g] : ['eight'];
}

/**
 * Evaluate a finished shot.
 * @param sim      simulation after the shot
 * @param side     'player' | 'enemy'
 * @param before   { ownLeft } own-group balls left before the shot
 * @param isBreak
 * @param flags    shot flags (safety etc.)
 */
export function evaluateShot(sim, side, before, isBreak, flags = {}) {
  const log = sim.log;
  const own = groupOf(side);
  const opp = side === 'player' ? 'stripe' : 'solid';
  const cue = sim.cue;
  const res = {
    side, isBreak,
    foul: null,
    pocketed: [],      // detailed entries for every ball that dropped
    own: [], opp: [], eight: false, cueScratch: false,
    rack: null,        // 'win' | 'lose' when the 8 decides the rack
    respotEight: false,
    continueTurn: false,
    kick: log.cueRailsBefore > 0 && log.first !== null,
    noContact: log.first === null,
  };

  // first contact legality
  const firstBall = log.first !== null ? sim.ball(log.first) : null;
  if (!firstBall) res.foul = 'noHit';
  else if (!isBreak) {
    const targets = before.ownLeft > 0 ? [own] : ['eight'];
    if (!targets.includes(firstBall.group)) res.foul = 'wrongBall';
  }

  let lastOwnTime = -1, eightTime = -1;
  for (const p of log.pockets) {
    const b = sim.ball(p.id);
    if (!b) continue;
    const entry = {
      ball: b, pocket: p.pocket, rails: p.rails, travel: p.travel,
      combo: p.lastHitBy !== null && p.lastHitBy !== cue?.id && b.group !== 'cue',
      bank: p.rails > 0,
      long: p.travel > BALANCE.LONG_DIST,
      time: p.time,
    };
    res.pocketed.push(entry);
    if (b.group === 'cue') res.cueScratch = true;
    else if (b.group === 'eight') { res.eight = true; eightTime = p.time; }
    else if (b.group === own) { res.own.push(entry); lastOwnTime = Math.max(lastOwnTime, p.time); }
    else if (b.group === opp) res.opp.push(entry);
  }
  if (res.cueScratch) res.foul = 'scratch';
  if (flags.safety && res.foul && res.foul !== 'scratch') res.safetyUsed = true;

  if (res.eight) {
    if (isBreak) {
      res.respotEight = true;
    } else {
      const ownLeftNow = remaining(sim, own);
      const cleared = before.ownLeft === 0 || (ownLeftNow === 0 && eightTime >= lastOwnTime);
      res.rack = cleared && !res.foul ? 'win' : 'lose';
    }
  }

  if (!res.rack) {
    if (isBreak) res.continueTurn = !res.foul && res.pocketed.some((e) => e.ball.group !== 'cue');
    else res.continueTurn = !res.foul && res.own.length > 0;
  }
  return res;
}
