// Source RSS / Atom : de nombreux portails, agences et outils d'alertes
// proposent des flux. Chaque item est analysé pour extraire prix, surface…

import { parseListingText, decodeEntities } from './parse.js';
import { geocode } from './geo.js';

// Empreinte courte et stable (FNV-1a), identique côté serveur et navigateur.
export function hash(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).slice(0, 12);
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim());
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : null;
};
const strip = (html) => decodeEntities(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').trim();

export function parseFeed(xml) {
  const items = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return items.map((it) => {
    const link = tag(it, 'link') || attr(it, 'link', 'href') || '';
    const descHtml = tag(it, 'description') || tag(it, 'content:encoded') || tag(it, 'summary') || tag(it, 'content');
    const img = attr(it, 'enclosure', 'url') || attr(it, 'media:content', 'url') || attr(it, 'media:thumbnail', 'url') ||
      (descHtml.match(/<img[^>]+src=["']([^"']+)/i) || [])[1] || null;
    return {
      title: strip(tag(it, 'title')),
      link: link.trim(),
      guid: tag(it, 'guid') || tag(it, 'id') || link,
      date: tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated') || tag(it, 'dc:date'),
      text: strip(descHtml),
      image: img,
    };
  });
}

export const rssSource = {
  id: 'rss',
  label: 'Flux RSS',
  async fetch({ settings, log }) {
    const feeds = settings.sources?.rss?.feeds || [];
    const out = [];
    for (const feed of feeds) {
      if (!feed?.url || feed.enabled === false) continue;
      try {
        const res = await fetch(feed.url, {
          headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml' },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const items = parseFeed(await res.text());
        const host = new URL(feed.url).hostname.replace(/^www\./, '');
        for (const it of items) {
          const p = parseListingText({ title: it.title, text: it.text });
          let { lat, lng } = {};
          if (p.city || p.postcode) {
            const g = await geocode(p.city || p.postcode, { postcode: p.postcode });
            if (g) { lat = g.lat; lng = g.lng; p.city = p.city || g.city; p.postcode = p.postcode || g.postcode; }
          }
          const h = hash(it.guid || it.link || it.title);
          const date = it.date && !isNaN(new Date(it.date)) ? new Date(it.date).toISOString() : undefined;
          out.push({
            ...p,
            id: `rss-${host}:${h}`,
            source: `rss-${host}`,
            sourceLabel: feed.label || host,
            url: it.link,
            lat: lat ?? null,
            lng: lng ?? null,
            photos: it.image ? [it.image] : [],
            publishedAt: date,
            firstSeen: date,
          });
        }
        log?.(`Flux ${feed.label || host} : ${items.length} annonces`);
      } catch (e) {
        log?.(`Flux ${feed.label || feed.url} en erreur : ${e.message}`);
      }
    }
    return out;
  },
};
