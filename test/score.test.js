import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, scoreCluster } from '../server/score.js';
import { DEFAULT_SETTINGS } from '../server/store.js';

const mk = (i, over = {}) => ({
  id: `x${i}`, type: 'appartement', city: 'Nantes', price: 4000 * 60, surface: 60, active: true, sources: ['a'],
  title: 'Appartement', description: '', firstSeen: new Date(Date.now() - 10 * 864e5).toISOString(), ...over,
});

test('un bien sous le marché, rare et en baisse obtient un score élevé', () => {
  const market = Array.from({ length: 10 }, (_, i) => mk(i));
  const deal = mk(99, { price: 3000 * 60, initialPrice: 3300 * 60, description: 'Loft atypique, dernier étage avec terrasse', sources: ['a', 'b'] });
  const stats = computeStats([...market, deal]);
  const s = scoreCluster(deal, stats, DEFAULT_SETTINGS);
  const avg = scoreCluster(market[0], stats, DEFAULT_SETTINGS);
  assert.ok(s.score >= 70, `score ${s.score}`);
  assert.ok(avg.score < 45, `score moyen ${avg.score}`);
  const keys = s.tags.map((t) => t.k);
  for (const k of ['under', 'rare', 'drop', 'multi']) assert.ok(keys.includes(k), k);
});

test('les pondérations à 0 désactivent un critère', () => {
  const market = Array.from({ length: 10 }, (_, i) => mk(i));
  const deal = mk(99, { price: 3000 * 60 });
  const stats = computeStats([...market, deal]);
  const s = scoreCluster(deal, stats, { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights, discount: 0 } });
  assert.ok(!s.parts.some((p) => p.key === 'discount'));
});
