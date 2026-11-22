// Serveur HTTP sans dépendance : API JSON + interface statique.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
import { clusterListings } from './dedup.js';
import { computeStats, scoreCluster } from './score.js';
import { haversineKm, geocode, searchPlaces } from './geo.js';
import { parseListingText, parseHtmlMeta } from './parse.js';
import { demoSource } from './sources/demo.js';
import { rssSource } from './sources/rss.js';

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SOURCES = [
  { ...demoSource, enabled: (s) => s.sources?.demo?.enabled !== false, authoritative: true },
  { ...rssSource, enabled: (s) => s.sources?.rss?.enabled !== false, authoritative: false },
];

let cache = null;
const logs = [];
const log = (msg) => { logs.unshift({ at: new Date().toISOString(), msg }); logs.length = Math.min(logs.length, 50); };

function buildClusters() {
  const s = store.settings;
  const enabledDemo = s.sources?.demo?.enabled !== false;
  const listings = store.listings.filter((l) => enabledDemo || !l.source.startsWith('demo-'));
  const clusters = clusterListings(listings, s.dedup);
  const stats = computeStats(clusters);
  const now = Date.now();
  const favById = store.db.favorites;
  for (const c of clusters) {
    Object.assign(c, scoreCluster(c, stats, s, now));
    c.distanceKm = haversineKm(c, s.zone);
    const favKey = c.members.map((m) => m.id).find((id) => favById[id]);
    c.favorite = favKey ? { ...favById[favKey], key: favKey } : null;
  }
  cache = clusters;
  return clusters;
}
const clusters = () => cache || buildClusters();
const invalidate = () => { cache = null; };

let refreshing = null;
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const s = store.settings;
    if (!s.demoEpoch) store.updateSettings({ demoEpoch: Date.now() });
    const counts = { new: 0, price: 0 };
    for (const src of SOURCES) {
      if (!src.enabled(s)) continue;
      try {
        const items = await src.fetch({ settings: store.settings, log });
        const seen = new Set();
        for (const l of items) {
          const r = store.upsert({ ...l, origin: src.id });
          if (r === 'new') counts.new++;
          if (r === 'price') counts.price++;
          seen.add(l.id);
        }
        // Source exhaustive : une annonce absente du lot a été retirée (vendue).
        if (src.authoritative) store.markMissing(src.id, seen);
      } catch (e) {
        log(`Source ${src.label} en erreur : ${e.message}`);
      }
    }
    store.db.meta.lastRefresh = new Date().toISOString();
    store.save();
    invalidate();
    log(`Actualisation : ${counts.new} nouvelles annonces, ${counts.price} changements de prix`);
    return counts;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

// ---------- Ajout manuel / capture ----------

async function parseInput({ url, title, text, image }) {
  let meta = null;
  if (url && !text) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (agregimmo; lecture ponctuelle)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) meta = parseHtmlMeta(await res.text());
    } catch { /* site inaccessible : l'utilisateur complètera à la main */ }
  }
  const fields = parseListingText({
    title: title || meta?.title || '',
    text: [text, meta?.description, meta?.bodyText].filter(Boolean).join('\n'),
  });
  if (meta?.ldPrice && !fields.price) fields.price = Math.round(meta.ldPrice);
  if (text || meta) fields.description = (text || meta?.description || '').slice(0, 4000);
  return { ...fields, url: url || '', photos: [image || meta?.image].filter(Boolean), fetched: !!meta };
}

async function addManual(body) {
  const url = String(body.url || '').trim();
  let host = 'manuel';
  try { if (url) host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* url invalide */ }
  const id = `${host}:${crypto.createHash('sha1').update(url || JSON.stringify(body)).digest('hex').slice(0, 12)}`;
  let { lat, lng } = body;
  if ((lat == null || lng == null) && (body.city || body.postcode)) {
    const g = await geocode(body.city || body.postcode, { postcode: body.postcode });
    if (g) { lat = g.lat; lng = g.lng; body.city = body.city || g.city; body.postcode = body.postcode || g.postcode; }
  }
  const n = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
  const listing = {
    id,
    source: host,
    sourceLabel: host,
    url,
    manual: true,
    title: body.title || 'Annonce',
    description: body.description || '',
    type: body.type || null,
    price: n(body.price),
    surface: n(body.surface),
    landSurface: n(body.landSurface),
    rooms: n(body.rooms),
    bedrooms: n(body.bedrooms),
    dpe: body.dpe || null,
    city: body.city || null,
    postcode: body.postcode || null,
    lat: lat ?? null,
    lng: lng ?? null,
    photos: body.photos || [],
    publishedAt: body.publishedAt ? new Date(body.publishedAt).toISOString() : undefined,
  };
  store.upsert(listing);
  store.save();
  invalidate();
  return listing;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...rest] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = (head || []).map((h) => h.trim().toLowerCase());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]?.trim()])));
}

const ALIASES = {
  prix: 'price', surface: 'surface', pieces: 'rooms', 'pièces': 'rooms', chambres: 'bedrooms', ville: 'city',
  'code postal': 'postcode', cp: 'postcode', lien: 'url', titre: 'title', description: 'description', terrain: 'landSurface',
  dpe: 'dpe', date: 'publishedAt', latitude: 'lat', longitude: 'lng',
};

async function importData({ format, content }) {
  let rows = [];
  if (format === 'csv') rows = parseCsv(String(content || ''));
  else {
    const j = JSON.parse(content);
    rows = Array.isArray(j) ? j : j.listings || [];
  }
  let added = 0;
  for (const raw of rows) {
    const r = {};
    for (const [k, v] of Object.entries(raw)) r[ALIASES[k.toLowerCase()] || k] = v;
    if (!r.title && !r.url && !r.price) continue;
    if (!r.type) r.type = parseListingText({ title: r.title, text: r.description }).type;
    await addManual(r);
    added++;
  }
  return { added };
}

// ---------- HTTP ----------

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

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

function publicState() {
  return {
    clusters: clusters(),
    settings: store.settings,
    searches: store.db.searches,
    meta: { lastRefresh: store.db.meta.lastRefresh, listings: store.listings.length, logs: logs.slice(0, 15) },
  };
}

const routes = [
  ['GET', /^\/api\/state$/, () => publicState()],
  ['POST', /^\/api\/refresh$/, async () => ({ counts: await refresh(), ...publicState() })],
  ['PUT', /^\/api\/settings$/, async (b) => {
    const prevEpoch = store.settings.demoEpoch;
    store.updateSettings(b);
    if (prevEpoch && !store.settings.demoEpoch) store.updateSettings({ demoEpoch: prevEpoch });
    invalidate();
    return publicState();
  }],
  ['PUT', /^\/api\/favorites\/(.+)$/, (b, [, id]) => { store.setFavorite(decodeURIComponent(id), b); invalidate(); return { ok: true }; }],
  ['DELETE', /^\/api\/favorites\/(.+)$/, (b, [, id]) => { store.removeFavorite(decodeURIComponent(id)); invalidate(); return { ok: true }; }],
  ['POST', /^\/api\/searches$/, (b) => store.addSearch(b)],
  ['PUT', /^\/api\/searches\/(.+)$/, (b, [, id]) => store.updateSearch(id, b)],
  ['DELETE', /^\/api\/searches\/(.+)$/, (b, [, id]) => { store.removeSearch(id); return { ok: true }; }],
  ['POST', /^\/api\/parse$/, (b) => parseInput(b)],
  ['POST', /^\/api\/listings$/, async (b) => { const l = await addManual(b); return { listing: l, ...publicState() }; }],
  ['DELETE', /^\/api\/listings\/(.+)$/, (b, [, id]) => { store.remove(decodeURIComponent(id)); invalidate(); return publicState(); }],
  ['POST', /^\/api\/import$/, async (b) => ({ ...(await importData(b)), ...publicState() })],
  ['GET', /^\/api\/export$/, () => ({ exportedAt: new Date().toISOString(), favorites: store.db.favorites, searches: store.db.searches, settings: store.settings, listings: store.listings.filter((l) => l.manual) })],
  ['POST', /^\/api\/reset$/, async () => { store.reset(); invalidate(); await refresh(); return publicState(); }],
  ['GET', /^\/api\/places$/, (b, m, url) => searchPlaces(url.searchParams.get('q'))],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) {
          const body = ['POST', 'PUT'].includes(method) ? await readBody(req) : {};
          return send(res, 200, await fn(body, m, url));
        }
      }
      return send(res, 404, { error: 'Route inconnue' });
    }
    let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, async () => {
    console.log(`agregimmo → http://localhost:${PORT}`);
    await refresh();
    const loop = () => {
      const min = Math.max(5, +store.settings.refreshMinutes || 30);
      setTimeout(async () => { await refresh().catch(() => {}); loop(); }, min * 60e3);
    };
    loop();
  });
}

export { server, refresh, buildClusters };
