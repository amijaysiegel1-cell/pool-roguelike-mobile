// Headless fight simulation: a bot plays the player side using the AI planner.
// node tests/fight.test.mjs [count]
import { Fight } from '../src/game/fight.js';
import { planShot } from '../src/game/ai.js';
import { RNG } from '../src/core/rng.js';
import { ENEMIES, ELITES } from '../src/data/enemies.js';
import { BOSSES } from '../src/data/bosses.js';

function makeRun(seed, items = []) {
  return {
    seed, char: 'rookie', hp: 70, maxHp: 70, coins: 50, items: items.map((id) => ({ id, n: 1 })),
    deck: ['steady_hand', 'power_break', 'big_pockets', 'safety_net', 'second_chance'], consumables: [],
    stats: { damage: 0, ballsSunk: 0, shots: 0, fouls: 0, coinsEarned: 0 },
  };
}

function playFight(run, enc, botSkill = 0.6, maxSeconds = 1200) {
  const f = new Fight(run, enc);
  f.headless = true;
  const rng = new RNG(run.seed + 'bot');
  let t = 0, shots = 0, enemyShots = 0;
  f.on('shot', (s) => { if (s.who === 'enemy') enemyShots++; else shots++; });
  f.start();
  let planner = null;
  const dt = 1 / 30;
  while (!f.result && t < maxSeconds) {
    if (f.state === 'aim' && f.turn === 'player') {
      if (!planner) planner = planShot(f.sim, 'player', f.isBreak, !!f.ballInHand, { skill: botSkill, banks: true }, rng);
      let r; do { r = planner.next(); } while (!r.done);
      planner = null;
      const p = r.value;
      if (p.place) f.moveCueBall(p.place.x, p.place.y);
      f.aim.angle = p.angle; f.aim.power = p.power; f.aim.spinX = p.spinX; f.aim.spinY = p.spinY;
      f.playerShoot();
    }
    f.update(dt);
    t += dt;
  }
  return { result: f.result, t, shots, enemyShots, hp: run.hp, enemies: f.enemies.map((e) => `${e.name}:${e.hp}/${e.maxHp}`), racks: f.rackNo };
}

const N = +(process.argv[2] || 4);
let fails = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const e = ENEMIES[i % ENEMIES.length];
  const enc = { key: 'n' + i, kind: 'normal', act: e.act, enemies: [{ ...e, hpRoll: 0.5 }], tableMods: i % 3 === 1 ? ['bumpers'] : [] };
  const r = playFight(makeRun('S' + i), enc);
  console.log(`normal ${e.name.padEnd(16)} won=${r.result?.won} t=${r.t.toFixed(0)}s shots=${r.shots}/${r.enemyShots} racks=${r.racks} hp=${r.hp} ${r.enemies.join(' ')}`);
  if (!r.result) fails++;
}
for (const b of BOSSES) {
  const enc = { key: 'b' + b.id, kind: 'boss', act: b.acts[b.acts.length - 1], boss: b.id, enemies: b.enemies };
  const run = makeRun('B' + b.id, ['explosive_tip', 'split_ball', 'fire_balls']);
  run.hp = 300; run.maxHp = 300;
  const r = playFight(run, enc, 0.7);
  console.log(`boss   ${b.name.padEnd(16)} won=${r.result?.won} t=${r.t.toFixed(0)}s shots=${r.shots}/${r.enemyShots} racks=${r.racks} hp=${r.hp} ${r.enemies.join(' ')}`);
  if (!r.result) fails++;
}
{
  const e = ELITES[0];
  const r = playFight(makeRun('E'), { key: 'e', kind: 'elite', act: 1, enemies: [e] });
  console.log(`elite  ${e.name.padEnd(16)} won=${r.result?.won} t=${r.t.toFixed(0)}s shots=${r.shots}/${r.enemyShots} hp=${r.hp} ${r.enemies.join(' ')}`);
  if (!r.result) fails++;
}
console.log('wall time', ((Date.now() - t0) / 1000).toFixed(1) + 's');
if (fails) { console.log(fails, 'fights did not finish'); process.exit(1); }
console.log('all fights finished');
