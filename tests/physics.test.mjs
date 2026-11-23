// Headless physics sanity checks: node tests/physics.test.mjs
import { Sim, makeBall } from '../src/physics/sim.js';
import { buildTable, rackPositions, rackOrder, HEAD_Y } from '../src/physics/table.js';
import { RNG } from '../src/core/rng.js';
import { TABLE, PHYS } from '../src/config.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

function rack(seed = 'x') {
  const sim = new Sim(buildTable());
  const rng = new RNG(seed);
  const order = rackOrder(rng);
  rackPositions(TABLE.R).forEach((p, i) => {
    const num = order[i];
    sim.balls.push(makeBall(num, num, num === 8 ? 'eight' : num < 8 ? 'solid' : 'stripe', p.x, p.y));
  });
  sim.balls.push(makeBall(0, 0, 'cue', TABLE.W / 2, HEAD_Y + 60));
  return sim;
}

// 1. Break: balls spread, everything stops, nobody leaves the table illegally
{
  let totalPocketed = 0, totalTime = 0;
  for (let k = 0; k < 20; k++) {
    const sim = rack('b' + k);
    sim.startShot();
    const cue = sim.cue;
    const ang = -Math.PI / 2 + (k - 10) * 0.002;
    sim.strike(cue, ang, PHYS.MAX_SPEED * PHYS.BREAK_MULT, 0, 0);
    const t = sim.run();
    totalTime += t;
    totalPocketed += sim.log.pockets.length;
    const bad = sim.balls.filter((b) => !b.pocketed && (b.x < -1 || b.x > TABLE.W + 1 || b.y < -1 || b.y > TABLE.H + 1));
    if (bad.length) console.log('escaped', bad.map((b) => [b.num, b.x.toFixed(1), b.y.toFixed(1)]));
    ok(bad.length === 0 && !sim.isMoving(), `break ${k}: settled in ${t.toFixed(2)}s, pocketed ${sim.log.pockets.length}, first=${sim.log.first}`);
  }
  console.log(`avg break time ${(totalTime / 20).toFixed(2)}s, avg pocketed ${(totalPocketed / 20).toFixed(2)}`);
}

// 2. Draw / follow / stun on a straight shot
function straight(spinY) {
  const sim = new Sim(buildTable());
  sim.balls.push(makeBall(1, 1, 'solid', 250, 400));
  sim.balls.push(makeBall(0, 0, 'cue', 250, 700));
  sim.startShot();
  sim.strike(sim.cue, -Math.PI / 2, 1100, 0, spinY);
  // measure where the cue ball is 0.5s after contact (before the object ball can come back)
  let t = 0, contact = null;
  while (t < 8) { sim.step(PHYS.DT); t += PHYS.DT; if (contact === null && sim.log.first !== null) contact = t; if (contact !== null && t > contact + 0.5) break; }
  return sim.cue.y;
}
const stun = straight(0), draw = straight(-1), follow = straight(1);
console.log('cue final y  stun', stun.toFixed(1), 'draw', draw.toFixed(1), 'follow', follow.toFixed(1));
ok(draw > 430 + 40, 'draw pulls the cue ball back');
ok(follow < 400, 'follow pushes the cue ball forward');
ok(stun < draw && stun > follow, 'center-ball result sits between draw and follow');

// 3. Straight-in pot into the top-left corner
{
  const sim = new Sim(buildTable());
  sim.balls.push(makeBall(1, 1, 'solid', 100, 100));
  sim.balls.push(makeBall(0, 0, 'cue', 200, 200));
  sim.startShot();
  sim.strike(sim.cue, Math.atan2(-1, -1), 900, 0, 0);
  sim.run();
  ok(sim.balls[0].pocketed, 'diagonal corner pot');
}

// 4. Side pocket pot
{
  const sim = new Sim(buildTable());
  sim.balls.push(makeBall(1, 1, 'solid', 60, 500));
  sim.balls.push(makeBall(0, 0, 'cue', 250, 500));
  sim.startShot();
  sim.strike(sim.cue, Math.PI, 900, 0, 0);
  sim.run();
  ok(sim.balls[0].pocketed, 'side pocket pot');
}

// 5. English: right english straight into the top rail drifts right
{
  const sim = new Sim(buildTable());
  sim.balls.push(makeBall(0, 0, 'cue', 250, 300));
  sim.startShot();
  sim.strike(sim.cue, -Math.PI / 2, 900, 1, 0);
  for (let i = 0; i < 300; i++) sim.step(PHYS.DT);
  console.log('right english rebound vx', sim.cue.vx.toFixed(1));
  ok(sim.cue.vx > 20, 'right english rebounds to the right');
}

// 6. Ball rolling along the rail into the corner drops
{
  const sim = new Sim(buildTable());
  sim.balls.push(makeBall(0, 0, 'cue', 300, TABLE.R + 0.5));
  sim.startShot();
  sim.strike(sim.cue, Math.PI, 700, 0, 0);
  sim.run();
  ok(sim.cue.pocketed, 'rail-hugging ball drops in corner');
}

// 7. perf
{
  const t0 = performance.now();
  for (let k = 0; k < 20; k++) {
    const sim = rack('p' + k); sim.orient = false;
    sim.startShot(); sim.strike(sim.cue, -Math.PI / 2, PHYS.MAX_SPEED, 0, 0); sim.run();
  }
  console.log('20 break sims in', (performance.now() - t0).toFixed(0), 'ms');
}

if (fails) { console.log(fails, 'failures'); process.exit(1); }
console.log('all physics tests passed');
