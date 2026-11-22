// Mode autonome : le moteur tourne dans le navigateur (téléphone, GitHub Pages),
// les données sont conservées sur l'appareil (localStorage).

import { Store } from './core/store.js';
import { createEngine } from './core/engine.js';

const KEY = 'agregimmo:db';

export function createLocalEngine() {
  const store = new Store({
    load: () => {
      try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
    },
    save: (db) => {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('Stockage local plein ou indisponible', e); }
    },
  });
  return createEngine({
    store,
    // La plupart des sites refusent la lecture depuis une autre origine (CORS) :
    // dans ce cas l'utilisateur colle le texte de l'annonce.
    fetchPage: async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      return res.ok ? res.text() : null;
    },
  });
}
