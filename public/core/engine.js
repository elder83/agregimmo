// Moteur commun : regroupement, score, actualisation, ajout, import et routes API.
// Utilisé par le serveur Node (server/index.js) et directement dans le navigateur
// (mode autonome, sur téléphone).

import { clusterListings } from './dedup.js';
import { computeStats, scoreCluster } from './score.js';
import { haversineKm, geocode, searchPlaces } from './geo.js';
import { parseListingText, parseHtmlMeta } from './parse.js';
import { demoSource } from './demo.js';
import { rssSource, hash } from './feed.js';

export function createEngine({ store, fetchPage = null }) {
  const SOURCES = [
    { ...demoSource, enabled: (s) => s.sources?.demo?.enabled !== false, authoritative: true },
    { ...rssSource, enabled: (s) => s.sources?.rss?.enabled !== false && (s.sources?.rss?.feeds || []).length > 0, authoritative: false },
  ];
  let cache = null;
  const logs = [];
  const log = (msg) => { logs.unshift({ at: new Date().toISOString(), msg }); logs.length = Math.min(logs.length, 50); };
  const invalidate = () => { cache = null; };

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

  let refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      if (!store.settings.demoEpoch) store.updateSettings({ demoEpoch: Date.now() });
      const counts = { new: 0, price: 0 };
      for (const src of SOURCES) {
        if (!src.enabled(store.settings)) continue;
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

  async function parseInput({ url, title, text, image }) {
    let meta = null;
    if (url && !text && fetchPage) {
      try {
        const html = await fetchPage(url);
        if (html) meta = parseHtmlMeta(html);
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
    const id = `${host}:${hash(url || JSON.stringify(body))}`;
    let { lat, lng } = body;
    if ((lat == null || lng == null || lat === '' || lng === '') && (body.city || body.postcode)) {
      const g = await geocode(body.city || body.postcode, { postcode: body.postcode });
      if (g) { lat = g.lat; lng = g.lng; body.city = body.city || g.city; body.postcode = body.postcode || g.postcode; }
    }
    const n = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
    const listing = {
      id, source: host, sourceLabel: host, url, manual: true,
      title: body.title || 'Annonce',
      description: body.description || '',
      type: body.type || null,
      price: n(body.price), surface: n(body.surface), landSurface: n(body.landSurface),
      rooms: n(body.rooms), bedrooms: n(body.bedrooms),
      dpe: body.dpe || null, city: body.city || null, postcode: body.postcode || null,
      lat: n(lat), lng: n(lng),
      photos: body.photos || [],
      publishedAt: body.publishedAt ? new Date(body.publishedAt).toISOString() : undefined,
    };
    store.upsert(listing);
    store.save();
    invalidate();
    return listing;
  }

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
    ['PUT', /^\/api\/settings$/, (b) => {
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
    ['GET', /^\/api\/places$/, (b, m, params) => searchPlaces(params.get('q'))],
  ];

  // Renvoie undefined si la route n'existe pas.
  async function handle(method, pathname, body = {}, params = new URLSearchParams()) {
    for (const [m, re, fn] of routes) {
      const match = pathname.match(re);
      if (match && m === method) return { found: true, data: await fn(body, match, params) };
    }
    return { found: false };
  }

  return { handle, refresh, buildClusters, store };
}

const ALIASES = {
  prix: 'price', surface: 'surface', pieces: 'rooms', 'pièces': 'rooms', chambres: 'bedrooms', ville: 'city',
  'code postal': 'postcode', cp: 'postcode', lien: 'url', titre: 'title', description: 'description', terrain: 'landSurface',
  dpe: 'dpe', date: 'publishedAt', latitude: 'lat', longitude: 'lng',
};

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const first = text.split('\n')[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
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
