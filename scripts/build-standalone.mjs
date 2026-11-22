// Assemble toute l'application en un seul fichier HTML autonome
// (dist/agregimmo.html) : modules JS regroupés, CSS en ligne,
// Leaflet chargé depuis cdnjs. Ce fichier peut être hébergé n'importe où
// ou publié comme page web, sans serveur.
//
//   node scripts/build-standalone.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const ORDER = [
  'core/geo.js', 'core/parse.js', 'core/score.js', 'core/dedup.js', 'core/demo.js', 'core/feed.js', 'core/remote.js',
  'core/store.js', 'core/engine.js', 'local.js', 'icons.js', 'app.js',
];
const key = (p) => path.basename(p, '.js');

function transform(file) {
  let src = fs.readFileSync(path.join(PUB, file), 'utf8');
  const exported = [];
  src = src.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm, (_, names, from) =>
    `const {${names.replace(/\s+as\s+/g, ': ')}} = __m[${JSON.stringify(key(from))}];`);
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  src = src.replace(/^export\s*\{([^}]+)\};?/gm, (_, names) => {
    exported.push(...names.split(',').map((n) => n.trim()).filter(Boolean));
    return '';
  });
  src = src.replace(/await import\(['"]\.\/([\w-]+)\.js['"]\)/g, (_, m) => `__m[${JSON.stringify(m)}]`);
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`Import/export non géré dans ${file}`);
  return `// ---- ${file} ----\n__m[${JSON.stringify(key(file))}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

const js = `globalThis.AGREGIMMO_STANDALONE = true;\nconst __m = {};\n${ORDER.map(transform).join('\n')}`;
const css = fs.readFileSync(path.join(PUB, 'vendor/leaflet/leaflet.css'), 'utf8') + '\n' + fs.readFileSync(path.join(PUB, 'app.css'), 'utf8');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/\s*<script[^>]*><\/script>/g, '');
const icon = fs.readFileSync(path.join(PUB, 'icons/icon-192.png')).toString('base64');

const out = `<title>agregimmo</title>
<meta name="description" content="Agrégateur d'annonces immobilières : biens rares, opportunités d'investissement." />
<meta name="theme-color" content="#1f6f5c" />
<link rel="icon" href="data:image/png;base64,${icon}" />
<link rel="apple-touch-icon" href="data:image/png;base64,${icon}" />
<style>
${css}
</style>
${body.trim()}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const dest = path.join(ROOT, 'dist/agregimmo.html');
fs.writeFileSync(dest, out);
console.log(`${path.relative(ROOT, dest)} — ${(out.length / 1024).toFixed(0)} Ko`);
