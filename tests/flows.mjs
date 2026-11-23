// Interaction flows in a real (touch-emulating) browser:
// slingshot shot, ball-in-hand drag, reload-and-resume mid fight, tutorial progression.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const URL = process.env.URL || 'http://localhost:8765/index.html';
const out = process.argv[2] || '.';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(500);

// 1. start a run and a fight
await page.evaluate(() => { __app.newRun({ char: 'rookie', seed: 'FLOWS' }); __app.show('map'); });
await page.locator('.map-node.available').first().dispatchEvent('click');
await page.waitForTimeout(400);
await page.locator('.overlay button').first().click();
await page.waitForTimeout(500);

// 2. ball-in-hand drag in the kitchen (mouse = pointer events)
const cueScreen = () => page.evaluate(() => { const s = __app.screen; const c = s.fight.sim.cue; const p = s.renderer.toScreen(c.x, c.y); const r = s.canvas.getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top, wx: c.x, wy: c.y }; });
const before = await cueScreen();
await page.mouse.move(before.x, before.y);
await page.mouse.down();
await page.mouse.move(before.x + 60, before.y + 10, { steps: 6 });
await page.mouse.up();
const after = await cueScreen();
ok(Math.abs(after.wx - before.wx) > 30, `ball in hand moved cue ball (${before.wx.toFixed(0)} → ${after.wx.toFixed(0)})`);

// 3. break with the power slider
const pw = await page.locator('.power').boundingBox();
await page.mouse.move(pw.x + pw.width / 2, pw.y + 20);
await page.mouse.down();
await page.mouse.move(pw.x + pw.width / 2, pw.y + pw.height * 0.8, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
ok(await page.evaluate(() => __app.screen.fight.state === 'moving'), 'power slider release shoots');

// wait for our turn again (enemy may shoot)
for (let i = 0; i < 80; i++) {
  const st = await page.evaluate(() => __app.screen.fight?.state);
  if (st === 'aim') break;
  await page.waitForTimeout(250);
}
const hpBefore = await page.evaluate(() => ({ hp: __app.run.hp, e: __app.screen.fight.enemies[0].hp, balls: __app.screen.fight.sim.balls.filter((b) => !b.pocketed).length }));

// 4. reload and resume
await page.reload();
await page.waitForTimeout(600);
ok(await page.locator('[data-act="continue"]').count() === 1, 'continue button after reload');
await page.locator('[data-act="continue"]').click();
await page.waitForTimeout(600);
const resumed = await page.evaluate(() => ({ screen: __app.screen.constructor.name, state: __app.screen.fight?.state, hp: __app.run.hp, e: __app.screen.fight?.enemies[0].hp, balls: __app.screen.fight?.sim.balls.filter((b) => !b.pocketed).length }));
ok(resumed.screen === 'MatchScreen' && resumed.state === 'aim', `resumed into match (${resumed.screen}/${resumed.state})`);
ok(resumed.e === hpBefore.e && resumed.balls === hpBefore.balls, `table & enemy HP restored (${resumed.e}/${hpBefore.e}, balls ${resumed.balls}/${hpBefore.balls})`);
await page.screenshot({ path: `${out}/f-resumed.png` });

// 5. tutorial: complete each lesson by driving the planner
await page.evaluate(() => __app.show('title'));
await page.evaluate(() => __app.startTutorial());
for (let lesson = 0; lesson < 3; lesson++) {
  for (let i = 0; i < 6 && (await page.locator('.coach').count()); i++) { await page.locator('.coach').first().click(); await page.waitForTimeout(120); }
  const title = await page.evaluate(() => __app.screen.lesson?.id);
  let passed = false;
  if (title === 'aim') {
    // slingshot: drag back from the cue ball (away from the 1-ball) and release
    const c = await cueScreen();
    const dir = await page.evaluate(() => { const f = __app.screen.fight; const b = f.sim.balls.find((x) => x.num === 1); const c = f.sim.cue; const a = Math.atan2(b.y - c.y, b.x - c.x); return { dx: Math.cos(a), dy: Math.sin(a) }; });
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x - dir.dx * 70, c.y - dir.dy * 70, { steps: 8 });
    const aim = await page.evaluate(() => ({ p: __app.screen.fight.aim.power }));
    ok(aim.p > 0.25, `slingshot sets power (${aim.p.toFixed(2)})`);
    await page.mouse.up();
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => __app.screen.fight.state === 'moving'), 'slingshot release shoots');
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(200); if ((await page.evaluate(() => __app.screen.lesson?.id)) !== title) { passed = true; break; } if (await page.evaluate(() => __app.screen.fight.state === 'aim')) break; }
  }
  for (let attempt = 0; attempt < 6 && !passed; attempt++) {
    await page.evaluate((lessonId) => {
      const f = __app.screen.fight;
      const tgt = f.sim.balls.find((b) => b.group === 'solid' && !b.pocketed);
      const c = f.sim.cue;
      if (lessonId === 'power') f.toggleArm('explosive_tip');
      const pockets = f.sim.table.pockets;
      // ghost-ball aim to the nearest pocket
      let best = null, bd = 1e9;
      for (const p of pockets) { const d = Math.hypot(p.x - tgt.x, p.y - tgt.y); if (d < bd) { bd = d; best = p; } }
      const ax = best.x - tgt.x, ay = best.y - tgt.y, L = Math.hypot(ax, ay);
      const gx = tgt.x - (ax / L) * 28, gy = tgt.y - (ay / L) * 28;
      f.aim.angle = Math.atan2(gy - c.y, gx - c.x);
      f.aim.power = lessonId === 'spin' ? 0.55 : 0.45;
      f.aim.spinY = lessonId === 'spin' ? -1 : 0;
      __app.screen.shoot();
    }, title);
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(200);
      const now = await page.evaluate(() => __app.screen.lesson?.id);
      if (now !== title) { passed = true; break; }
      if (await page.evaluate(() => __app.screen.fight.state === 'aim')) break;
    }
  }
  ok(passed, `tutorial lesson "${title}" completed`);
}
await page.screenshot({ path: `${out}/f-tutorial-fight.png` });
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
if (fails) process.exit(1);
