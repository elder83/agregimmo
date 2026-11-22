import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterListings, matchScore } from '../public/core/dedup.js';
import { generateDemo } from '../public/core/demo.js';

const base = {
  type: 'appartement', city: 'Nantes', postcode: '44000', rooms: 3, surface: 68, price: 249000, dpe: 'D',
  lat: 47.21, lng: -1.55, description: 'Bel appartement T3 dernier étage avec terrasse, quartier Graslin, parquet, cave.',
  publishedAt: '2026-10-01T00:00:00Z',
};

test('recoupe la même annonce publiée sur deux portails', () => {
  const a = { ...base, id: 'a:1', source: 'a', title: 'T3 68 m² Nantes' };
  const b = { ...base, id: 'b:9', source: 'b', title: 'Appartement 3 pièces', price: 255000, surface: 67, lat: null, lng: null, publishedAt: '2026-10-05T00:00:00Z' };
  assert.ok(matchScore(a, b) >= 0.72);
  const [c, ...rest] = clusterListings([a, b]);
  assert.equal(rest.length, 0);
  assert.equal(c.members.length, 2);
  assert.equal(c.price, 249000);
  assert.equal(c.firstSeen, '2026-10-01T00:00:00.000Z');
});

test('ne fusionne pas deux biens différents', () => {
  const a = { ...base, id: 'a:1', source: 'a', title: 'T3' };
  assert.equal(matchScore(a, { ...a, id: 'b:1', surface: 90 }), 0);
  assert.equal(matchScore(a, { ...a, id: 'b:2', rooms: 4 }), 0);
  assert.equal(matchScore(a, { ...a, id: 'b:3', dpe: 'F' }), 0);
  assert.equal(matchScore(a, { ...a, id: 'b:4', type: 'maison' }), 0);
  assert.equal(matchScore(a, { ...a, id: 'b:5', price: 320000 }), 0);
});

test('détecte une remise en ligne et une baisse de prix', () => {
  const a = { ...base, id: 'a:1', source: 'a', title: 'T3', active: false, priceHistory: [{ date: '2026-06-01T00:00:00Z', price: 270000 }], publishedAt: '2026-06-01T00:00:00Z' };
  const b = { ...base, id: 'a:2', source: 'a', title: 'T3', price: 249000, publishedAt: '2026-10-01T00:00:00Z' };
  const [c] = clusterListings([a, b]);
  assert.equal(c.members.length, 2);
  assert.equal(c.reposted, true);
  assert.equal(c.initialPrice, 270000);
  assert.equal(c.firstSeen, '2026-06-01T00:00:00.000Z');
});

test('précision du dédoublonnage sur le jeu de démo ≥ 95 %', () => {
  const L = generateDemo({ epoch: Date.parse('2026-11-01') , now: Date.parse('2026-11-22') });
  const C = clusterListings(L);
  const key = (id) => id.split(':')[1].replace('-r', '');
  const pure = C.filter((c) => new Set(c.members.map((m) => key(m.id))).size === 1).length;
  assert.ok(pure / C.length >= 0.95, `pureté ${(pure / C.length).toFixed(3)}`);
});
