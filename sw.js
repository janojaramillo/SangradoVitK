/* SDVK Neo — service worker
   Red primero para la página (siempre la versión nueva si hay internet),
   caché como respaldo (funciona sin conexión). Íconos y manifiesto van incrustados en index.html. */
const VERSION = 'sdvk-neo-v1.0.0-2026-11-10';
const CORE = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // allSettled: si una ruta falla, la instalación no se cae
    await Promise.allSettled(CORE.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('sdvk-neo-') && k !== VERSION).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: red primero (máx. 4 s), luego caché
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const preload = event.preloadResponse ? await event.preloadResponse : null;
        const res = preload || await Promise.race([fetch(req), timeout(4000)]);
        if (res && res.ok) {
          cache.put('./index.html', res.clone());
          return res;
        }
        throw new Error('bad response');
      } catch (e) {
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('<h1>Sin conexión</h1><p>Abra la app una vez con internet para guardarla.</p>',
                 { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // Otros recursos del mismo origen: caché y actualización en segundo plano
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504 });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
