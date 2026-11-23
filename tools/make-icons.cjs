// Renders assets/icon.svg to PNG icons with the preinstalled Chromium.
// node tools/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../assets/icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(__dirname, `../assets/icon-${size}.png`) });
    await page.close();
  }
  await browser.close();
  console.log('icons written');
})();
