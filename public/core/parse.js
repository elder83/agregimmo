// Extraction de champs structurés depuis un texte libre d'annonce
// (copier-coller, flux RSS, page capturée par le bookmarklet).

const num = (s) => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[\s  .]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function parsePrice(text) {
  const t = String(text || '');
  const candidates = [];
  // 245 000 €, 245.000€, 1 250 000 euros
  for (const m of t.matchAll(/(\d{1,3}(?:[\s  .]\d{3})+|\d{4,8})(?:[,.]\d{1,2})?\s*(?:€|eur(?:os?)?\b)/gi)) {
    candidates.push(num(m[1]));
  }
  // 245k€, 1,2 M€
  for (const m of t.matchAll(/(\d+(?:[,.]\d+)?)\s*(k|m)\s*€/gi)) {
    const base = parseFloat(m[1].replace(',', '.'));
    candidates.push(m[2].toLowerCase() === 'k' ? base * 1e3 : base * 1e6);
  }
  const plausible = candidates.filter((n) => n && n >= 5000 && n <= 50_000_000);
  if (!plausible.length) return null;
  // Le prix de vente est en général le plus gros montant (hors €/m² et charges).
  return Math.round(Math.max(...plausible));
}

export function parseSurface(text) {
  const t = String(text || '');
  let surface = null;
  let land = null;
  const landM = t.match(/terrain[^.\d]{0,25}(\d[\d\s .,]*)\s*m(?:²|2)/i);
  if (landM) land = num(landM[1]);
  const habM = t.match(/(?:surface|habitable|carrez)[^.\d]{0,25}(\d+(?:[,.]\d+)?)\s*m(?:²|2)/i);
  if (habM) surface = num(habM[1]);
  if (surface == null) {
    for (const m of t.matchAll(/(\d+(?:[,.]\d+)?)\s*m(?:²|2)(?![\w])/gi)) {
      const before = t.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
      if (/terrain|parcelle|jardin de/.test(before)) continue;
      if (/€\s*\/\s*$/.test(before) || /\/\s*$/.test(before)) continue;
      const v = num(m[1]);
      if (v >= 8 && v <= 2000) { surface = v; break; }
    }
  }
  return { surface, landSurface: land };
}

export function parseRooms(text) {
  const t = String(text || '');
  const p = t.match(/(\d{1,2})\s*pi[eè]ces?/i) || t.match(/\b[TF](\d{1,2})\b/);
  const c = t.match(/(\d{1,2})\s*chambres?/i);
  if (/\bstudio\b/i.test(t) && !p) return { rooms: 1, bedrooms: 0 };
  return { rooms: p ? +p[1] : null, bedrooms: c ? +c[1] : null };
}

export function parseType(text) {
  const t = String(text || '').toLowerCase();
  if (/immeuble|ensemble immobilier|plateau/.test(t)) return 'immeuble';
  if (/terrain (?:à bâtir|constructible)|parcelle/.test(t) && !/maison|appartement/.test(t)) return 'terrain';
  if (/local commercial|murs commerciaux|bureaux?\b|entrepôt|fonds de commerce/.test(t)) return 'local';
  if (/parking|garage|box\b/.test(t) && !/maison|appartement/.test(t)) return 'parking';
  if (/maison|villa|longère|pavillon|corps de ferme|mas\b|chalet|échoppe/.test(t)) return 'maison';
  if (/appartement|studio|duplex|loft|triplex|\b[tf]\d\b/.test(t)) return 'appartement';
  return null;
}

export function parseDpe(text) {
  const t = String(text || '');
  const m =
    t.match(/\bDPE\s*(?:[:=]|classe)?\s*([A-G])\b/i) ||
    t.match(/classe\s+[ée]nerg[ée]tique\s*:?\s*([A-G])\b/i) ||
    t.match(/\b[ée]nergie\s*:?\s*([A-G])\b/i);
  return m ? m[1].toUpperCase() : null;
}

const CITY = String.raw`[A-ZÀ-Ÿ][a-zà-ÿ'’]+(?:[\s-](?:sur|en|de|la|le|les|du|d'|l'|[A-ZÀ-Ÿ][a-zà-ÿ'’]+))*`;
const CP = String.raw`(?:0[1-9]|[1-8]\d|9[0-5]|2A|2B)\d{3}`;

export function parseLocation(text) {
  const t = String(text || '');
  // « Nantes (44000) » ou « Nantes 44000 »
  let m = t.match(new RegExp(`(${CITY})\\s*\\(?(${CP})\\)?(?![\\d])`));
  if (m && !/^(Prix|Vente|Surface|Terrain|Appartement|Maison|DPE)$/i.test(m[1].split(/\s/).pop())) return { postcode: m[2], city: m[1].trim() };
  // « 44000 Nantes »
  m = t.match(new RegExp(`\\b(${CP})\\b[\\s,-]*(${CITY})?`));
  if (m) return { postcode: m[1], city: m[2]?.trim() || null };
  m = t.match(new RegExp(`\\b(?:à|sur|secteur|quartier)\\s+(${CITY})`));
  return { postcode: null, city: m ? m[1] : null };
}

export function parseListingText({ title = '', text = '' } = {}) {
  const all = `${title}\n${text}`;
  const { surface, landSurface } = parseSurface(all);
  const { rooms, bedrooms } = parseRooms(all);
  const loc = parseLocation(all);
  return {
    title: title.trim() || all.trim().split(/\n|\.\s/)[0].slice(0, 120),
    description: String(text || '').trim().slice(0, 4000),
    price: parsePrice(all),
    surface,
    landSurface,
    rooms,
    bedrooms,
    type: parseType(all),
    dpe: parseDpe(all),
    postcode: loc.postcode,
    city: loc.city,
  };
}

// Métadonnées d'une page HTML (OpenGraph + JSON-LD schema.org).
export function parseHtmlMeta(html) {
  const meta = (prop) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
      'i'
    );
    const m = html.match(re);
    return m ? decodeEntities(m[1] ?? m[2]) : null;
  };
  const title = meta('og:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
  const description = meta('og:description') || meta('description') || '';
  const image = meta('og:image');
  let ldPrice = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const stack = [j];
      while (stack.length) {
        const o = stack.pop();
        if (!o || typeof o !== 'object') continue;
        if (o.price && !ldPrice) ldPrice = num(o.price);
        for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
      }
    } catch { /* JSON-LD invalide : ignoré */ }
  }
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 15000);
  return { title: decodeEntities(title.trim()), description, image, ldPrice, bodyText: decodeEntities(bodyText) };
}

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&euro;/g, '€')
    .replace(/&sup2;/g, '²')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}
