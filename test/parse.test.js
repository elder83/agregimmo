import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListingText, parsePrice, parseHtmlMeta } from '../public/core/parse.js';
import { parseFeed } from '../public/core/feed.js';

test('extrait les champs d’un texte d’annonce', () => {
  const p = parseListingText({ text: 'Vente Appartement T3 68 m² Nantes 44000. Dernier étage. Prix : 249 000 €. DPE : D. 2 chambres.' });
  assert.equal(p.price, 249000);
  assert.equal(p.surface, 68);
  assert.equal(p.rooms, 3);
  assert.equal(p.bedrooms, 2);
  assert.equal(p.type, 'appartement');
  assert.equal(p.dpe, 'D');
  assert.equal(p.city, 'Nantes');
  assert.equal(p.postcode, '44000');
});

test('distingue surface habitable et terrain, ignore le prix au m²', () => {
  const p = parseListingText({ title: 'Maison 5 pièces 120 m2', text: '44230 Saint-Sébastien-sur-Loire - terrain de 800 m². 420 000 € soit 3 500 €/m²' });
  assert.equal(p.surface, 120);
  assert.equal(p.landSurface, 800);
  assert.equal(p.price, 420000);
  assert.equal(p.type, 'maison');
  assert.equal(p.city, 'Saint-Sébastien-sur-Loire');
});

test('formats de prix variés', () => {
  assert.equal(parsePrice('89k€'), 89000);
  assert.equal(parsePrice('1,2 M€'), 1200000);
  assert.equal(parsePrice('Prix 1.250.000 euros'), 1250000);
  assert.equal(parsePrice('Charges 120 €/mois'), null);
});

test('lit OpenGraph et JSON-LD', () => {
  const m = parseHtmlMeta('<meta property="og:title" content="Loft 140 m²"><script type="application/ld+json">{"offers":{"price":"512000"}}</script>');
  assert.equal(m.title, 'Loft 140 m²');
  assert.equal(m.ldPrice, 512000);
});

test('analyse un flux RSS', () => {
  const items = parseFeed(`<rss><channel><item><title>Maison 4 pièces</title><link>https://ex.fr/1</link>
    <description><![CDATA[<p>Maison 95 m² à Vertou 44120, 365 000 €</p>]]></description><pubDate>Sun, 22 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, 'https://ex.fr/1');
  const p = parseListingText({ title: items[0].title, text: items[0].text });
  assert.equal(p.price, 365000);
  assert.equal(p.surface, 95);
});
