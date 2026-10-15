// Keeps a copy of the game so the app opens fast and solo play still loads without a connection.
// Always tries the network first, so a new version shows up as soon as it is deployed.
const CACHE = 'fellow-neighbors-v2';
// Tapping an update notification opens (or focuses) the game.
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => { for (const c of cs) { if ('focus' in c) return c.focus(); } return self.clients.openWindow('/'); })); });
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname === '/ws' || url.pathname === '/healthz' || url.pathname === '/version.json') return;
  e.respondWith(fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || Response.error())));
});
