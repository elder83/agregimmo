// Recoupement des annonces : regroupe en un seul « bien » les annonces
// publiées sur plusieurs portails (ou republiées sur le même portail).

import { haversineKm, normCity } from './geo.js';

const STOP = new Set(
  'le la les de des du un une et en a au aux pour par sur dans avec sans ce cette ces son sa ses vous nous est sont il elle on tres plus tout tous'.split(' ')
);

export function tokens(text) {
  return new Set(
    String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !STOP.has(w))
      .slice(0, 160)
  );
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const rel = (a, b) => Math.abs(a - b) / Math.max(a, b);

// Probabilité (0..1) que deux annonces décrivent le même bien.
export function matchScore(a, b, opts = {}) {
  const priceTol = opts.priceTol ?? 0.08;
  const surfaceTol = opts.surfaceTol ?? 0.04;
  if (a.id === b.id) return 1;
  if (a.type && b.type && a.type !== b.type) return 0;
  if (a.rooms && b.rooms && a.rooms !== b.rooms) return 0;
  if (a.price && b.price && rel(a.price, b.price) > priceTol) return 0;
  if (a.dpe && b.dpe && a.dpe !== b.dpe) return 0;

  const dist = haversineKm(a, b);
  if (dist != null && dist > 3) return 0;

  const textSim = jaccard(a._tok || tokens(a.description), b._tok || tokens(b.description));
  let score = 0;

  if (a.surface && b.surface) {
    const d = Math.abs(a.surface - b.surface);
    if (d > 2 && rel(a.surface, b.surface) > surfaceTol) return 0;
    score += 0.45;
  } else if (a.landSurface && b.landSurface && a.landSurface === b.landSurface) {
    score += 0.4;
  } else {
    // Sans surface, on exige un texte très proche et un prix quasi identique.
    if (!(a.price && b.price && rel(a.price, b.price) <= 0.03)) return 0;
    return textSim >= 0.55 ? 0.7 + textSim * 0.3 : 0;
  }

  if (a.price && b.price) score += 0.2 * (1 - rel(a.price, b.price) / priceTol);
  if (a.landSurface && b.landSurface && a.landSurface === b.landSurface) score += 0.1;
  if (a.dpe && b.dpe) score += 0.05;
  if (dist != null) score += dist < 0.4 ? 0.15 : dist < 1 ? 0.05 : -0.15;
  score += Math.min(0.35, textSim * 0.9);
  return Math.max(0, Math.min(1, score));
}

function blockKey(l) {
  return `${l.type || '?'}|${l.postcode || normCity(l.city) || '?'}`;
}

export function clusterListings(listings, opts = {}) {
  const threshold = opts.threshold ?? 0.72;
  const list = listings.map((l) => ({ ...l, _tok: tokens(`${l.title} ${l.description}`) }));
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const members = list.map((_, i) => [i]);
  const union = (i, j) => {
    const ri = find(i), rj = find(j);
    parent[ri] = rj;
    members[rj] = members[rj].concat(members[ri]);
    members[ri] = null;
  };
  // Pas de chaînage aveugle : on ne fusionne deux groupes que si aucune paire n'est incompatible.
  const compatible = (i, j) => {
    for (const x of members[find(i)]) for (const y of members[find(j)]) if (matchScore(list[x], list[y], opts) === 0) return false;
    return true;
  };

  const blocks = new Map();
  list.forEach((l, i) => {
    const k = blockKey(l);
    if (!blocks.has(k)) blocks.set(k, []);
    blocks.get(k).push(i);
  });

  for (const idx of blocks.values()) {
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const i = idx[x], j = idx[y];
        if (find(i) === find(j)) continue;
        if (matchScore(list[i], list[j], opts) >= threshold && compatible(i, j)) union(i, j);
      }
    }
  }

  const groups = new Map();
  list.forEach((l, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    delete l._tok;
    groups.get(r).push(l);
  });
  return [...groups.values()].map(mergeCluster);
}

const median = (arr) => {
  const s = arr.filter((v) => v != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mode = (arr) => {
  const c = new Map();
  for (const v of arr) if (v != null) c.set(v, (c.get(v) || 0) + 1);
  let best = null, n = 0;
  for (const [v, k] of c) if (k > n) { best = v; n = k; }
  return best;
};
const ts = (d) => (d ? new Date(d).getTime() : null);

export function mergeCluster(members) {
  const sorted = [...members].sort(
    (a, b) => (ts(a.publishedAt || a.firstSeen) ?? 0) - (ts(b.publishedAt || b.firstSeen) ?? 0) || a.id.localeCompare(b.id)
  );
  const active = sorted.filter((m) => m.active !== false);
  const pool = active.length ? active : sorted;
  const first = sorted[0];

  const prices = pool.map((m) => m.price).filter(Boolean);
  const now = Date.now();
  const firstSeen = Math.min(now, ...sorted.map((m) => ts(m.publishedAt || m.firstSeen)).filter(Boolean));
  const lastSeen = Math.max(firstSeen, ...sorted.map((m) => ts(m.lastSeen || m.firstSeen || m.publishedAt)).filter(Boolean));

  const history = [];
  for (const m of sorted) {
    for (const h of m.priceHistory || []) history.push({ date: h.date, price: h.price, source: m.source });
    if (!(m.priceHistory || []).length && m.price) history.push({ date: m.publishedAt || m.firstSeen, price: m.price, source: m.source });
  }
  history.sort((a, b) => ts(a.date) - ts(b.date));
  const initialPrice = history[0]?.price ?? null;
  const price = prices.length ? Math.min(...prices) : null;

  // Republication : même portail, plusieurs annonces, ou annonce récente pour un bien déjà vu bien avant.
  const bySource = new Map();
  for (const m of sorted) bySource.set(m.source, (bySource.get(m.source) || 0) + 1);
  const latestPub = Math.max(firstSeen, ...sorted.map((m) => ts(m.publishedAt || m.firstSeen)).filter(Boolean));
  const reposted = [...bySource.values()].some((n) => n > 1) || latestPub - firstSeen > 21 * 864e5;

  const withCoords = sorted.find((m) => m.lat != null && m.lng != null);
  const longest = (k) => sorted.reduce((best, m) => ((m[k] || '').length > (best || '').length ? m[k] : best), '');

  return {
    id: first.id,
    title: (pool.find((m) => m.title) || first).title,
    description: longest('description'),
    type: mode(sorted.map((m) => m.type)),
    price,
    maxPrice: prices.length ? Math.max(...prices) : null,
    initialPrice,
    surface: median(sorted.map((m) => m.surface)),
    landSurface: median(sorted.map((m) => m.landSurface)),
    rooms: mode(sorted.map((m) => m.rooms)),
    bedrooms: mode(sorted.map((m) => m.bedrooms)),
    dpe: mode(sorted.map((m) => m.dpe)),
    city: mode(sorted.map((m) => m.city)),
    postcode: mode(sorted.map((m) => m.postcode)),
    lat: withCoords?.lat ?? null,
    lng: withCoords?.lng ?? null,
    photos: [...new Set(sorted.flatMap((m) => m.photos || []))].slice(0, 12),
    firstSeen: new Date(firstSeen).toISOString(),
    lastSeen: new Date(lastSeen).toISOString(),
    active: active.length > 0,
    reposted,
    manual: sorted.some((m) => m.manual),
    priceHistory: history,
    sources: [...new Set(sorted.map((m) => m.source))],
    members: sorted.map((m) => ({
      id: m.id,
      source: m.source,
      sourceLabel: m.sourceLabel || m.source,
      url: m.url,
      price: m.price,
      publishedAt: m.publishedAt || m.firstSeen,
      active: m.active !== false,
      manual: !!m.manual,
    })),
  };
}
