// Outils géographiques : distance, normalisation des communes, géocodage.

export function haversineKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function normCity(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(st)\b/g, 'saint')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Géocodage via la Base Adresse Nationale (api-adresse.data.gouv.fr), gratuite et ouverte.
const cache = new Map();
export async function geocode(query, { postcode } = {}) {
  const q = String(query || '').trim();
  if (!q) return null;
  const key = `${q}|${postcode || ''}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const url = new URL('https://api-adresse.data.gouv.fr/search/');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '1');
    url.searchParams.set('type', 'municipality');
    if (postcode) url.searchParams.set('postcode', postcode);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const f = json.features?.[0];
    const out = f
      ? {
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          city: f.properties.city || f.properties.name,
          postcode: f.properties.postcode,
        }
      : null;
    cache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

export async function searchPlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  try {
    const url = new URL('https://api-adresse.data.gouv.fr/search/');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '6');
    url.searchParams.set('type', 'municipality');
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features || []).map((f) => ({
      label: `${f.properties.city || f.properties.name} (${f.properties.postcode})`,
      city: f.properties.city || f.properties.name,
      postcode: f.properties.postcode,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));
  } catch {
    return [];
  }
}
