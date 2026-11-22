import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../public/core/store.js';
import { createEngine } from '../public/core/engine.js';

test('le moteur autonome fonctionne sans serveur (mode téléphone)', async () => {
  let saved = null;
  const store = new Store({ load: () => saved, save: (db) => { saved = structuredClone(db); } });
  const engine = createEngine({ store });
  const r = await engine.handle('POST', '/api/refresh');
  assert.ok(r.found);
  assert.ok(r.data.counts.new > 100);
  const id = r.data.clusters[0].id;
  await engine.handle('PUT', `/api/favorites/${encodeURIComponent(id)}`, { status: 'visite' });
  store.flush();
  // Rechargement depuis la persistance : le favori est conservé.
  const engine2 = createEngine({ store: new Store({ load: () => saved, save: () => {} }) });
  const s = await engine2.handle('GET', '/api/state');
  assert.equal(s.data.clusters.find((c) => c.id === id).favorite.status, 'visite');
  assert.equal((await engine2.handle('GET', '/api/inconnue')).found, false);
});
