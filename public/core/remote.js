// Source « Alertes e-mail » : lit un fichier JSON d'annonces tenu à jour
// automatiquement (une tâche programmée lit les alertes des portails reçues
// dans Gmail et les dépose dans la branche `annonces` du dépôt).

import { geocode } from './geo.js';

export const DEFAULT_REMOTE_URL = 'https://raw.githubusercontent.com/elder83/agregimmo/annonces/annonces.json';

const num = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);

export function normalizeRemote(raw) {
  const list = Array.isArray(raw) ? raw : raw?.listings || [];
  return list
    .filter((l) => l && (l.url || l.id) && (l.price || l.title))
    .map((l) => {
      const source = String(l.source || 'alerte').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      return {
        id: l.id || `mail-${source}:${l.url}`,
        source: `mail-${source}`,
        sourceLabel: l.sourceLabel || l.source || 'Alerte e-mail',
        url: l.url || '',
        title: l.title || '',
        description: l.description || '',
        type: l.type || null,
        price: num(l.price),
        surface: num(l.surface),
        landSurface: num(l.landSurface),
        rooms: num(l.rooms),
        bedrooms: num(l.bedrooms),
        dpe: l.dpe ? String(l.dpe).toUpperCase().slice(0, 1) : null,
        city: l.city || null,
        postcode: l.postcode ? String(l.postcode) : null,
        lat: num(l.lat),
        lng: num(l.lng),
        photos: Array.isArray(l.photos) ? l.photos.slice(0, 6) : [],
        publishedAt: l.publishedAt || l.receivedAt || undefined,
        firstSeen: l.publishedAt || l.receivedAt || undefined,
      };
    });
}

export const remoteSource = {
  id: 'remote',
  label: 'Alertes e-mail',
  async fetch({ settings, log }) {
    const url = settings.sources?.remote?.url || DEFAULT_REMOTE_URL;
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (res.status === 404) { log?.('Alertes e-mail : aucun fichier pour le moment'); return []; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = normalizeRemote(await res.json());
    for (const l of items) {
      if ((l.lat == null || l.lng == null) && (l.city || l.postcode)) {
        const g = await geocode(l.city || l.postcode, { postcode: l.postcode });
        if (g) { l.lat = g.lat; l.lng = g.lng; l.city = l.city || g.city; l.postcode = l.postcode || g.postcode; }
      }
    }
    log?.(`Alertes e-mail : ${items.length} annonces`);
    return items;
  },
};
