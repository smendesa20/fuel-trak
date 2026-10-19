// MacroTrack service worker
// When you upload a new version, change v1 to v2 (then v3...). Optional now, but it clears old saved files.
const CACHE_NAME = 'fueltrak-v3';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

// Save the core files. Each file is saved on its own, so one missing file can't break the install.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(CORE.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

// Delete old versions' files.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Gemini API and anything else outside this site always go straight to the internet.
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');

  if (isPage) {
    // The app page: get the newest version when online, use the saved copy when offline.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req.url, { cache: 'no-store', credentials: 'same-origin' });
        if (fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req.url, fresh.clone());
        }
        return fresh;
      } catch (err) {
        return (await caches.match(req.url)) ||
               (await caches.match('./index.html')) ||
               (await caches.match('./')) ||
               Response.error();
      }
    })());
    return;
  }

  // Icons and manifest: use the saved copy, fetch it if it isn't saved yet.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});

// Lets the "Update available, tap to refresh" banner switch to the new version.
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.action === 'skipWaiting' || d.type === 'SKIP_WAITING') self.skipWaiting();
});
