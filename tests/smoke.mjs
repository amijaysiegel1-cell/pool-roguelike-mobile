// Browser smoke test (Playwright). Serve the repo first:
//   python3 -m http.server 8765
//   node tests/smoke.mjs [outdir]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const URL = process.env.URL || 'http://localhost:8765/index.html';
const out = process.argv[2] || '.';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const click = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(300); };

await page.goto(URL);
await page.waitForTimeout(800);
await shot('01-title');

// Tutorial lesson 1
await click('[data-act="tutorial"]');
await page.waitForTimeout(400);
for (let i = 0; i < 6 && (await page.locator('.coach').count()); i++) { await page.locator('.coach').first().click(); await page.waitForTimeout(150); }
if (errors.length) console.log('early errors', errors);
await page.waitForTimeout(300);
await shot('02-tutorial');

// Shoot via the fight API (aim at the 1 ball) to exercise rendering of motion
await page.evaluate(() => {
  const f = __app.screen.fight;
  const b = f.sim.balls.find((x) => x.num === 1), c = f.sim.cue;
  f.aim.angle = Math.atan2(b.y - c.y, b.x - c.x);
  f.aim.power = 0.45;
  __app.screen.shoot();
});
await page.waitForTimeout(500);
await shot('03-tutorial-moving');
await page.waitForTimeout(3500);
await shot('04-after-shot');

// Back to title, start a real run
await page.evaluate(() => __app.show('title'));
await page.waitForTimeout(300);
await click('[data-act="new"]');
if (await page.locator('.modal').count()) await page.locator('.modal [data-i="0"]').click();
await page.waitForTimeout(300);
await shot('05-chars');
await click('[data-act="start"]');
await shot('06-act');
await click('[data-act="go"]');
await page.waitForTimeout(400);
await shot('07-map');
// enter first available node
await page.locator('.map-node.available').first().dispatchEvent('click');
await page.waitForTimeout(600);
await shot('08-intro');
const startBtn = page.locator('.overlay button');
if (await startBtn.count()) await startBtn.first().click();
await page.waitForTimeout(800);
await shot('09-match');

// Break with the slider: drag the power handle
const pw = await page.locator('.power').boundingBox();
await page.mouse.move(pw.x + pw.width / 2, pw.y + 20);
await page.mouse.down();
await page.mouse.move(pw.x + pw.width / 2, pw.y + pw.height * 0.75, { steps: 8 });
await shot('10-power');
await page.mouse.up();
await page.waitForTimeout(700);
await shot('11-break');
await page.waitForTimeout(7000);
await shot('12-after-break');

const state = await page.evaluate(() => ({ state: __app.screen.fight?.state, turn: __app.screen.fight?.turn, hp: __app.run?.hp, enemy: __app.screen.fight?.enemies.map((e) => e.hp) }));
console.log('state', JSON.stringify(state));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
