// Headless full-run simulation: walks entire runs (map → nodes → fights with a
// bot → rewards/shops/events/rest/treasure → bosses → next act) to shake out
// data and logic errors. node tests/run.test.mjs [runs]
import { Fight } from '../src/game/fight.js';
import { planShot } from '../src/game/ai.js';
import { RNG, streamFor } from '../src/core/rng.js';
import { defaultProfile } from '../src/game/meta.js';
import {
  createRun, availableNodes, enterNode, encounterFor, fightRewards, giveItem, giveCard, makeShop, pickEvent, makeEventCtx,
  treasureLoot, startAct, finishRun, rivalEncounter, raccoonScenario, chooseEnding,
} from '../src/game/run.js';
import { CHARACTERS } from '../src/data/characters.js';
import { CHALLENGES } from '../src/data/challenges.js';
import { BOSS_MAP } from '../src/data/bosses.js';

function playFight(run, enc, botSkill = 0.75) {
  const f = new Fight(run, enc);
  f.headless = true;
  const rng = new RNG(enc.key + 'bot');
  f.start();
  let t = 0;
  while (!f.result && t < 2400) {
    if (f.state === 'aim' && f.turn === 'player') {
      // play a card / arm abilities sometimes
      if (f.hand.length && rng.chance(0.4)) f.playCard(0);
      for (const id of Object.keys(f.charges)) if (f.charges[id] > 0 && rng.chance(0.3)) f.toggleArm(id);
      if (run.consumables.length && rng.chance(0.15)) f.useConsumable(0);
      if (f.result || f.state !== 'aim') { f.update(1 / 30); t += 1 / 30; continue; }
      const g = planShot(f.sim, 'player', f.isBreak, !!f.ballInHand, { skill: botSkill, banks: true }, rng);
      let r; do { r = g.next(); } while (!r.done);
      const p = r.value;
      if (p.place) f.moveCueBall(p.place.x, p.place.y);
      Object.assign(f.aim, { angle: p.angle, power: p.power, spinX: p.spinX, spinY: p.spinY });
      f.playerShoot();
    }
    f.update(1 / 30);
    t += 1 / 30;
  }
  if (!f.result) throw new Error('fight did not finish: ' + enc.key);
  return f;
}

const N = +(process.argv[2] || 3);
const t0 = Date.now();
let wins = 0;
for (let k = 0; k < N; k++) {
  const profile = defaultProfile();
  profile.unlocked.chars = CHARACTERS.map((c) => c.id);
  const ch = CHARACTERS[k % CHARACTERS.length].id;
  const challenge = k % 4 === 3 ? CHALLENGES[k % CHALLENGES.length].id : null;
  const run = createRun({ char: ch, seed: 'TEST-' + k, ascension: k % 3, challenge }, profile);
  const rng = new RNG('walk' + k);
  const log = [];
  let alive = true, won = false, lastFight = null;
  outer: while (alive) {
    const avail = availableNodes(run);
    if (!avail.length) throw new Error('no available nodes');
    const node = rng.pick(avail);
    const { type, black } = enterNode(run, node.id);
    run.floorsCleared++;
    log.push(type[0]);
    // keep the bot alive long enough to test later acts
    if (run.hp < run.maxHp * 0.5 && !challenge) run.hp = run.maxHp;
    if (type === 'fight' || type === 'elite' || type === 'boss') {
      const enc = encounterFor(run, node, type === 'fight' ? 'normal' : type);
      const f = playFight(run, enc);
      lastFight = f;
      if (!f.result.won) { alive = false; break; }
      run.stats.fightsWon++;
      const rw = fightRewards(run, enc, profile);
      run.coins += rw.coins;
      if (rw.relic) giveItem(run, rw.relic, profile);
      if (rw.consumable) giveItem(run, rw.consumable, profile);
      const ch = rw.choices[rng.int(0, rw.choices.length - 1)];
      if (ch) (ch.kind === 'card' ? giveCard : giveItem)(run, ch.id, profile);
      if (type === 'boss') {
        run.bossesMet.push(enc.boss);
        run.stats.bossesBeaten++;
        if (BOSS_MAP[enc.boss].final) { won = true; break outer; }
        startAct(run, run.act + 1);
        log.push('|');
      }
    } else if (type === 'shop') {
      const s = makeShop(run, node, profile, black);
      for (const it of s.stock) if (run.coins >= it.price && rng.chance(0.5)) { run.coins -= it.price; (it.kind === 'card' ? giveCard : giveItem)(run, it.id, profile); }
    } else if (type === 'event') {
      const ev = pickEvent(run, node, profile);
      const ctx = makeEventCtx(run, profile, streamFor(run.seed, 'e' + node.id));
      ev.onEnter?.(ctx);
      const choices = ev.choices(ctx).filter((c) => !c.disabled);
      const c = rng.pick(choices);
      const out = c.run() || {};
      if (out.fight) {
        const enc = out.fight === 'rival' ? rivalEncounter(run, node, profile) : encounterFor(run, node, 'elite', out.fight);
        const f = playFight(run, enc);
        if (!f.result.won) { alive = false; break; }
      }
      if (out.sideGame) {
        const sc = raccoonScenario(run, node.id);
        const f = playFight(run, { key: 'rac' + node.id, kind: 'trick', act: run.act, enemies: [], scenario: sc });
        log.push(f.result.won ? 'R+' : 'R-');
      }
      if (typeof out.text !== 'string' && !out.fight && !out.sideGame) throw new Error('event without outcome ' + ev.id);
    } else if (type === 'rest') {
      run.hp = Math.min(run.maxHp, run.hp + 20);
    } else if (type === 'treasure') {
      const l = treasureLoot(run, node, profile);
      run.coins += l.coins;
      for (const id of l.items) giveItem(run, id, profile);
    }
    if (run.hp <= 0) { alive = false; break; }
  }
  const ending = won ? chooseEnding(run, lastFight?.flags) : null;
  const sum = finishRun(run, profile, won, ending);
  if (won) wins++;
  console.log(`run ${k} ${ch.padEnd(10)} ${challenge || ''} A${run.ascension} ${won ? 'WON (' + ending + ')' : 'died act ' + run.act} items=${run.items.length} deck=${run.deck.length} score=${sum.score} path=${log.join('')}`);
}
console.log(`${wins}/${N} won · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
