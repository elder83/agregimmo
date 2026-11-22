// Service worker : l'application s'ouvre même sans réseau.
// Stratégie « réseau d'abord » pour toujours servir la dernière version publiée,
// avec repli sur le cache hors connexion.
const CACHE = 'agregimmo-v3';
const SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'icons.js', 'local.js', 'manifest.webmanifest',
  'core/engine.js', 'core/store.js', 'core/dedup.js', 'core/score.js', 'core/parse.js', 'core/geo.js', 'core/demo.js', 'core/feed.js', 'core/remote.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    // « no-cache » : on revalide toujours auprès du serveur, pour afficher
    // la nouvelle version dès sa publication (sinon jusqu'à 10 min de retard).
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
