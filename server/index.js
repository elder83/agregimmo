// Serveur HTTP sans dépendance (optionnel) : sert l'interface et expose le moteur
// en API JSON. Avantage par rapport au mode autonome du téléphone : actualisation
// en tâche de fond et lecture des flux RSS / pages sans restriction CORS.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../public/core/store.js';
import { createEngine } from '../public/core/engine.js';

const PORT = +process.env.PORT || 3000;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.AGREGIMMO_DATA || path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'db.json');

const store = new Store({
  load: () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null),
  save: (db) => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(db));
    fs.renameSync(`${FILE}.tmp`, FILE);
  },
});

const engine = createEngine({
  store,
  fetchPage: async (url) => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (agregimmo; lecture ponctuelle)', Accept: 'text/html' },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? res.text() : null;
  },
});

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 8e6) throw new Error('Corps de requête trop volumineux');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { text: raw }; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const r = await engine.handle(req.method, url.pathname, body, url.searchParams);
      return r.found ? send(res, 200, r.data) : send(res, 404, { error: 'Route inconnue' });
    }
    let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, async () => {
  console.log(`agregimmo → http://localhost:${PORT}`);
  await engine.refresh();
  const loop = () => {
    const min = Math.max(5, +store.settings.refreshMinutes || 30);
    setTimeout(async () => { await engine.refresh().catch(() => {}); loop(); }, min * 60e3);
  };
  loop();
});
