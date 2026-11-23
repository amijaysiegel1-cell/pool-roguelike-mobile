// Zero-dependency bundler: inlines every ES module, the stylesheet and the
// app icon into ONE self-contained HTML file (dist/rack-and-ruin.html) that
// works offline and even when opened straight from disk.
//   node tools/build.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src/main.js');
const modules = new Map(); // abs path -> { code, deps }
const order = [];
const visiting = new Set();

const IMPORT_RE = /^import\s+([\s\S]*?)\s+from\s+['"](.+?)['"];?[ \t]*$/gm;

function load(file) {
  if (modules.has(file)) return;
  if (visiting.has(file)) throw new Error('Circular import: ' + file);
  visiting.add(file);
  const src = fs.readFileSync(file, 'utf8');
  const deps = [];
  for (const m of src.matchAll(IMPORT_RE)) deps.push(path.resolve(path.dirname(file), m[2]));
  for (const d of deps) load(d);
  visiting.delete(file);
  modules.set(file, { src });
  order.push(file);
}

function transform(file, src) {
  const id = (f) => JSON.stringify(path.relative(root, f));
  let code = src.replace(IMPORT_RE, (_, what, from) => {
    const target = id(path.resolve(path.dirname(file), from));
    what = what.trim();
    if (what.startsWith('* as ')) return `const ${what.slice(5).trim()} = __m[${target}];`;
    const inner = what.replace(/^\{|\}$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => s.replace(/\s+as\s+/, ': ')).join(', ');
    return `const { ${inner} } = __m[${target}];`;
  });
  const names = [];
  code = code.replace(/^export\s+(async\s+function\*?|function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => { names.push(name); return `${kw} ${name}`; });
  code = code.replace(/^export\s*\{([^}]*)\};?/gm, (_, list) => { for (const n of list.split(',')) { const t = n.trim(); if (t) names.push(t.replace(/\s+as\s+/, ': ')); } return ''; });
  if (/^export\s/m.test(code)) throw new Error('Unhandled export form in ' + file);
  return `__m[${id(file)}] = (() => {\n${code}\nreturn { ${names.join(', ')} };\n})();\n`;
}

load(entry);
let js = '"use strict";\nwindow.__BUNDLED = true;\nconst __m = {};\n';
for (const f of order) js += `// ── ${path.relative(root, f)} ──\n` + transform(f, modules.get(f).src);

const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const icon = fs.readFileSync(path.join(root, 'assets/icon-180.png')).toString('base64');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/png" href="data:image/png;base64,${icon}">`)
  .replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="data:image/png;base64,${icon}">`)
  .replace(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/rack-and-ruin.html');
fs.writeFileSync(out, html);
console.log(`built ${path.relative(root, out)} — ${order.length} modules, ${(html.length / 1024).toFixed(0)} KB`);
