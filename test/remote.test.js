import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRemote } from '../public/core/remote.js';
import { clusterListings } from '../public/core/dedup.js';

test('normalise les annonces issues des alertes e-mail', () => {
  const out = normalizeRemote({ listings: [
    { source: 'Leboncoin', url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/1', title: 'Maison 5 pièces', price: '385000', surface: 112, rooms: 5, city: 'Vertou', postcode: 44120, type: 'maison', dpe: 'd', receivedAt: '2026-11-22T07:00:00Z' },
    { source: 'SeLoger', title: 'sans prix ni lien' },
  ] });
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'mail-leboncoin');
  assert.equal(out[0].price, 385000);
  assert.equal(out[0].postcode, '44120');
  assert.equal(out[0].dpe, 'D');
  assert.equal(out[0].publishedAt, '2026-11-22T07:00:00Z');
});

test('une même maison reçue de deux portails est recoupée', () => {
  const base = { type: 'maison', price: 385000, surface: 112, rooms: 5, city: 'Vertou', postcode: '44120', description: 'Maison familiale 5 pièces jardin garage proche bourg Vertou' };
  const L = normalizeRemote([{ ...base, source: 'Leboncoin', url: 'https://a/1' }, { ...base, source: 'SeLoger', url: 'https://b/2', price: 390000 }]);
  assert.equal(clusterListings(L).length, 1);
});
