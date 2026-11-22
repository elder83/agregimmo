// Score d'opportunité (0–100) : sous-évaluation, rareté, baisse de prix,
// rendement locatif, durée de mise en vente. Chaque point est justifié.

import { normCity } from './geo.js';

export const DEFAULT_RARITY = [
  { term: 'vue mer', weight: 9 },
  { term: 'pieds dans l\'eau', weight: 10 },
  { term: 'vue loire', weight: 7 },
  { term: 'vue dégagée', weight: 4 },
  { term: 'dernier étage', weight: 4 },
  { term: 'rooftop', weight: 7 },
  { term: 'terrasse', weight: 4 },
  { term: 'sans vis-à-vis', weight: 4 },
  { term: 'jardin', weight: 3 },
  { term: 'piscine', weight: 4 },
  { term: 'loft', weight: 6 },
  { term: 'atypique', weight: 6 },
  { term: 'atelier', weight: 5 },
  { term: 'hôtel particulier', weight: 10 },
  { term: 'maison de maître', weight: 7 },
  { term: 'architecte', weight: 5 },
  { term: 'cachet', weight: 3 },
  { term: 'parquet', weight: 1 },
  { term: 'moulures', weight: 2 },
  { term: 'cheminée', weight: 1 },
  { term: 'hauteur sous plafond', weight: 3 },
  { term: 'à rénover', weight: 5 },
  { term: 'travaux', weight: 3 },
  { term: 'divisible', weight: 7 },
  { term: 'division possible', weight: 7 },
  { term: 'immeuble de rapport', weight: 9 },
  { term: 'monopropriété', weight: 8 },
  { term: 'vendu loué', weight: 4 },
  { term: 'viager', weight: 6 },
  { term: 'succession', weight: 5 },
  { term: 'urgent', weight: 4 },
  { term: 'à saisir', weight: 3 },
  { term: 'prix négociable', weight: 3 },
  { term: 'constructible', weight: 4 },
  { term: 'garage', weight: 1 },
  { term: 'parking', weight: 1 },
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function ppm2(c) {
  return c.price && c.surface ? c.price / c.surface : null;
}

export function computeStats(clusters) {
  const byCityType = new Map();
  const byType = new Map();
  const surfacesByType = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const c of clusters) {
    if (!c.active) continue;
    const p = ppm2(c);
    if (c.surface) push(surfacesByType, c.type, c.surface);
    if (!p || c.type === 'terrain' || c.type === 'parking') continue;
    push(byCityType, `${normCity(c.city)}|${c.type}`, p);
    push(byType, c.type, p);
  }
  const med = (m, min) => new Map([...m].filter(([, v]) => v.length >= min).map(([k, v]) => [k, { median: median(v), n: v.length }]));
  return {
    cityType: med(byCityType, 4),
    type: med(byType, 3),
    surfaces: new Map([...surfacesByType].map(([k, v]) => [k, v.sort((a, b) => a - b)])),
  };
}

function referencePpm2(c, stats, settings) {
  const refs = settings?.references?.pricePerM2 || {};
  const manual = refs[normCity(c.city)] ?? Object.entries(refs).find(([k]) => normCity(k) === normCity(c.city))?.[1];
  if (manual) return { value: +manual, origin: 'référence saisie' };
  const ct = stats.cityType.get(`${normCity(c.city)}|${c.type}`);
  if (ct) return { value: ct.median, origin: `médiane de ${ct.n} biens à ${c.city}` };
  const t = stats.type.get(c.type);
  if (t) return { value: t.median, origin: `médiane de ${t.n} biens de la zone` };
  return null;
}

function rentPerM2(c, settings) {
  const r = settings?.references?.rentPerM2 || {};
  const hit = Object.entries(r).find(([k]) => k !== 'default' && normCity(k) === normCity(c.city));
  return hit ? +hit[1] : r.default ? +r.default : null;
}

export function grossYield(c, settings) {
  const rent = rentPerM2(c, settings);
  if (!rent || !c.surface || !c.price) return null;
  if (!['appartement', 'maison', 'immeuble', 'local'].includes(c.type)) return null;
  // Les petites surfaces se louent plus cher au m².
  const adj = c.surface < 30 ? 1.25 : c.surface < 50 ? 1.1 : c.surface > 100 ? 0.85 : 1;
  return (rent * adj * c.surface * 12) / c.price;
}

export function scoreCluster(c, stats, settings, now = Date.now()) {
  const w = { discount: 1, rarity: 1, drop: 1, yield: 1, market: 1, ...(settings?.weights || {}) };
  const parts = [];
  const tags = [];
  const add = (key, label, pts, detail) => {
    const p = Math.round(pts * (w[key] ?? 1));
    if (p !== 0) parts.push({ key, label, points: p, detail });
  };

  // 1. Prix au m² vs marché local
  const p = ppm2(c);
  const ref = p ? referencePpm2(c, stats, settings) : null;
  let discount = null;
  if (p && ref) {
    discount = 1 - p / ref.value;
    add('discount', 'Prix vs marché', clamp(discount * 150, -20, 40),
      `${Math.round(p).toLocaleString('fr-FR')} €/m² contre ${Math.round(ref.value).toLocaleString('fr-FR')} €/m² (${ref.origin})`);
    if (discount >= 0.12) tags.push({ k: 'under', label: `−${Math.round(discount * 100)} % marché` });
    if (discount <= -0.2) tags.push({ k: 'over', label: 'Au-dessus du marché' });
  }

  // 2. Rareté : mots-clés + caractéristiques statistiquement rares
  const text = norm(`${c.title} ${c.description}`);
  const kws = settings?.rarityKeywords?.length ? settings.rarityKeywords : DEFAULT_RARITY;
  const hits = kws.filter((k) => k.term && text.includes(norm(k.term)));
  let rarity = hits.reduce((s, k) => s + (+k.weight || 0), 0);
  const details = hits.map((k) => k.term);
  const surf = stats.surfaces.get(c.type);
  if (c.surface && surf?.length >= 10) {
    const rank = surf.filter((s) => s < c.surface).length / surf.length;
    if (rank >= 0.95) { rarity += 6; details.push('surface dans le top 5 % de la zone'); }
  }
  if (c.type === 'maison' && c.landSurface >= 1500) { rarity += 4; details.push(`terrain ${c.landSurface} m²`); }
  rarity = Math.min(rarity, 30);
  if (rarity > 0) add('rarity', 'Rareté', rarity, details.join(', '));
  if (rarity >= 12) tags.push({ k: 'rare', label: 'Rare' });

  // 3. Baisse de prix
  let drop = null;
  if (c.initialPrice && c.price && c.price < c.initialPrice) {
    drop = 1 - c.price / c.initialPrice;
    add('drop', 'Baisse de prix', clamp(drop * 120, 0, 15),
      `${Math.round(drop * 100)} % depuis la première diffusion (${c.initialPrice.toLocaleString('fr-FR')} €)`);
    tags.push({ k: 'drop', label: `Baisse −${Math.round(drop * 100)} %` });
  }

  // 4. Rendement locatif brut estimé
  const y = grossYield(c, settings);
  if (y != null) {
    const pts = y >= 0.09 ? 15 : y >= 0.075 ? 11 : y >= 0.06 ? 6 : y >= 0.05 ? 2 : 0;
    add('yield', 'Rendement brut estimé', pts, `${(y * 100).toFixed(1)} % (loyer de référence de la zone)`);
    if (y >= 0.07) tags.push({ k: 'yield', label: `Rdt ${(y * 100).toFixed(1)} %` });
  }

  // 5. Dynamique de mise en vente
  const days = Math.floor((now - new Date(c.firstSeen).getTime()) / 864e5);
  const newDays = settings?.newDays ?? 3;
  if (days <= newDays) tags.push({ k: 'new', label: 'Nouveau' });
  if (days >= 90) {
    add('market', 'Marge de négociation', days >= 180 ? 8 : 5, `en vente depuis ${days} jours`);
    tags.push({ k: 'old', label: `${days} j en ligne` });
  }
  if (c.reposted) {
    add('market', 'Remis en ligne', 3, 'annonce republiée : l\'ancienneté réelle est masquée');
    tags.push({ k: 'repost', label: 'Remis en ligne' });
  }
  if (c.dpe === 'F' || c.dpe === 'G') {
    add('market', 'Levier rénovation', 3, `DPE ${c.dpe} : vendeur sous pression, travaux à chiffrer (location ${c.dpe === 'G' ? 'interdite depuis 2025' : 'interdite en 2028'})`);
    tags.push({ k: 'dpe', label: `DPE ${c.dpe}` });
  }
  if (c.sources.length > 1) tags.push({ k: 'multi', label: `${c.sources.length} portails` });
  if (c.maxPrice && c.price && c.maxPrice - c.price > 1000) {
    tags.push({ k: 'gap', label: `Écart ${(c.maxPrice - c.price).toLocaleString('fr-FR')} €` });
  }

  const raw = parts.reduce((s, x) => s + x.points, 0);
  const score = clamp(Math.round(20 + raw), 0, 100);
  return { score, parts, tags, ppm2: p, refPpm2: ref?.value ?? null, discount, drop, yield: y, daysOnline: days };
}
