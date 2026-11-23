// Visits every screen in a real browser and checks for errors.
//   python3 -m http.server 8765 &  node tests/screens.mjs [outdir]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const URL = process.env.URL || 'http://localhost:8765/index.html';
const out = process.argv[2] || '.';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL);
await page.waitForTimeout(600);

const visit = async (name, js, wait = 500) => {
  await page.evaluate(js);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/s-${name}.png` });
  const n = errors.length;
  if (n) console.log(`after ${name}: ${n} errors`);
};

for (const s of ['collection', 'clubhouse', 'achievements', 'leaderboard', 'settings', 'challenges', 'chars']) {
  await visit(s, `__app.show('${s}')`);
}
// start a run then visit run screens
await visit('act', `__app.newRun({ char: 'rookie', seed: 'SCREENTEST' })`);
await visit('map', `__app.show('map')`);
await visit('shop', `(() => { const r = __app.run; r.coins = 400; const n = r.map.nodes.find(n => n.floor === 2); __app.show('shop', { nodeId: n.id, black: false }); })()`);
await visit('blackmarket', `(() => { const n = __app.run.map.nodes.find(n => n.floor === 3); __app.show('shop', { nodeId: n.id, black: true }); })()`);
await page.locator('[data-act="buy:0"]').first().click().catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/s-buy-modal.png` });
await page.locator('.modal [data-i="0"]').first().click().catch(() => {});
for (const ev of ['mentor', 'oracle', 'raccoon', 'rival', 'side_bet', 'pawn_shop', 'jukebox', 'wormhole']) {
  await visit('event-' + ev, `(() => { const n = __app.run.map.nodes.find(n => n.floor === 1); __app.show('event', { nodeId: n.id + '${ev}', eventId: '${ev}' }); })()`, 300);
  await page.locator('[data-act="choose:0"]').first().click().catch(() => {});
  await page.waitForTimeout(400);
  if (['raccoon', 'rival'].includes(ev)) { await page.screenshot({ path: `${out}/s-event-${ev}-go.png` }); await page.evaluate(`__app.show('map')`); }
}
await visit('rest', `(() => { const n = __app.run.map.nodes.find(n => n.floor === 5); __app.show('rest', { nodeId: n.id }); })()`);
await page.locator('[data-act="heal"]').click();
await visit('treasure', `(() => { const n = __app.run.map.nodes.find(n => n.floor === 4); __app.show('treasure', { nodeId: n.id }); })()`);
await page.locator('[data-act="open"]').dispatchEvent('click');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/s-treasure-open.png` });
await visit('reward', `(() => { const r = __app.run; const n = r.map.nodes[0]; const enc = { key: 'rw', kind: 'elite', act: 1, enemies: [] }; __app.show('reward', { enc }); })()`, 900);
// boss fights
for (const b of ['shark', 'twins', 'mona', 'living_table', 'cosmic8']) {
  await visit('boss-' + b, `(() => { const r = __app.run; r.items.push({ id: 'explosive_tip', n: 1 }, { id: 'fire_balls', n: 1 }, { id: 'extra_pocket', n: 1 }); r.consumables = ['rewind', 'chalk_bomb']; const act = { shark: 1, twins: 2, mona: 2, living_table: 3, cosmic8: 4 }['${b}']; __app.debugBoss('${b}', act); })()`, 400);
  for (let i = 0; i < 6 && (await page.locator('.overlay').count()); i++) { await page.locator('.overlay').first().click().catch(() => {}); await page.waitForTimeout(250); }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/s-boss-${b}-fight.png` });
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
