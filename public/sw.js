// GymCore PWA Service Worker — v4 (never cache private API responses)
const CACHE_NAME = 'gymcore-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only cache the app shell and versioned static assets. API responses can
  // contain private member, payment, or platform-admin data and must always
  // come from the server, even when the browser is offline.
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  const isAppNavigation = event.request.mode === 'navigate';
  const isVersionedAsset = requestUrl.pathname.startsWith('/assets/');
  if (!isAppNavigation && !isVersionedAsset) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const cacheKey = isAppNavigation ? '/' : event.request;
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
        }
        return response;
      })
      .catch(async () => {
        const cacheKey = isAppNavigation ? '/' : event.request;
        const cached = await caches.match(cacheKey);
        return cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});
