// Persistance locale dans data/db.json (aucune base de données à installer).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RARITY } from './score.js';

const DIR = process.env.AGREGIMMO_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DIR, 'db.json');

export const DEFAULT_SETTINGS = {
  zone: { label: 'Nantes (44000)', city: 'Nantes', lat: 47.2184, lng: -1.5536, radiusKm: 15 },
  sources: {
    demo: { enabled: true },
    rss: { enabled: true, feeds: [] },
  },
  refreshMinutes: 30,
  newDays: 3,
  references: { pricePerM2: {}, rentPerM2: { default: 13 } },
  rarityKeywords: DEFAULT_RARITY,
  weights: { discount: 1, rarity: 1, drop: 1, yield: 1, market: 1 },
  dedup: { priceTol: 0.08, surfaceTol: 0.04, threshold: 0.72 },
  notifications: false,
};

function empty() {
  return { version: 1, listings: {}, favorites: {}, searches: [], settings: structuredClone(DEFAULT_SETTINGS), meta: {} };
}

function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over) || typeof base !== 'object' || typeof over !== 'object' || !base || !over) {
    return over === undefined ? base : over;
  }
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}

class Store {
  constructor() {
    this.db = empty();
    this.timer = null;
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      this.db = { ...empty(), ...raw, settings: deepMerge(structuredClone(DEFAULT_SETTINGS), raw.settings || {}) };
    } catch { /* premier lancement */ }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, FILE);
  }

  get settings() { return this.db.settings; }
  updateSettings(patch) {
    this.db.settings = deepMerge(this.db.settings, patch);
    this.save();
    return this.db.settings;
  }

  // Insère ou met à jour une annonce ; suit l'historique de prix.
  upsert(l, now = new Date().toISOString()) {
    const prev = this.db.listings[l.id];
    if (!prev) {
      const history = l.priceHistory?.length ? l.priceHistory : l.price ? [{ date: l.publishedAt || now, price: l.price }] : [];
      this.db.listings[l.id] = { ...l, firstSeen: l.firstSeen || now, lastSeen: now, active: l.active !== false, priceHistory: history };
      return 'new';
    }
    const history = [...(prev.priceHistory || [])];
    if (l.priceHistory?.length) {
      for (const h of l.priceHistory) if (!history.some((x) => x.date === h.date)) history.push(h);
      history.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (l.price && l.price !== prev.price) {
      history.push({ date: now, price: l.price });
    }
    this.db.listings[l.id] = { ...prev, ...l, firstSeen: prev.firstSeen, lastSeen: now, active: l.active !== false, priceHistory: history };
    return l.price !== prev.price ? 'price' : 'same';
  }

  remove(id) { delete this.db.listings[id]; this.save(); }
  markMissing(origin, seenIds) {
    for (const l of Object.values(this.db.listings)) {
      if (l.origin === origin && !seenIds.has(l.id) && !l.manual) l.active = false;
    }
  }

  get listings() { return Object.values(this.db.listings); }

  setFavorite(id, data) {
    const prev = this.db.favorites[id] || { addedAt: new Date().toISOString(), status: 'suivi', note: '' };
    this.db.favorites[id] = { ...prev, ...data };
    this.save();
    return this.db.favorites[id];
  }
  removeFavorite(id) { delete this.db.favorites[id]; this.save(); }

  addSearch(s) {
    const search = { id: `s${Date.now().toString(36)}`, createdAt: new Date().toISOString(), seenAt: new Date().toISOString(), ...s };
    this.db.searches.push(search);
    this.save();
    return search;
  }
  updateSearch(id, patch) {
    const s = this.db.searches.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
    this.save();
    return s;
  }
  removeSearch(id) { this.db.searches = this.db.searches.filter((s) => s.id !== id); this.save(); }

  reset({ keepSettings = true } = {}) {
    const settings = this.db.settings;
    this.db = empty();
    if (keepSettings) this.db.settings = { ...settings, demoEpoch: undefined };
    this.flush();
  }
}

export const store = new Store();
