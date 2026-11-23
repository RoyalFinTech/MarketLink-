/* MarketLink Gambia PWA service worker. Keep app shell available offline without caching API responses. */
// v44: cache the Gambian place index for offline saved-address autocomplete.
'use strict';
const CACHE_NAME = 'marketlink-shell-v63';
const APP_SHELL = [
  './',
  './index.html',
  './premium-marketlink.css?v=marketlink-premium-canonical-r36',
  './premium-marketlink.js?v=marketlink-premium-canonical-r55',
  './marketlink-i18n.js?v=marketlink-locale-r2',
  './manifest.webmanifest',
  './data/gambia-address-index.json',
  './assets/marketlink-logo.png',
  './assets/favicon-32.png',
  './assets/apple-touch-icon-180.png',
  './assets/marketlink-app-icon-192.png',
  './assets/marketlink-app-icon-512.png',
  './assets/marketlink-app-icon-maskable-192.png',
  './assets/marketlink-app-icon-maskable-512.png',
  './assets/marketlink-app-icon.svg',
  './assets/marketlink-app-icon-maskable.svg',
  './assets/marketlink-og-preview.jpg'
];
self.addEventListener('install', event => {
  event.waitUntil((async function(){
    const cache = await caches.open(CACHE_NAME);
    // A single optional icon or stale asset must never block the entire PWA
    // update. Cache the document and each critical bundle independently.
    const critical = ['./', './index.html',
      './premium-marketlink.css?v=marketlink-premium-canonical-r36',
      './premium-marketlink.js?v=marketlink-premium-canonical-r55'];
    for (const url of critical) {
      try { await cache.add(url); }
      catch (error) { console.warn('[MarketLink PWA] Critical shell asset will use network:', url, error); }
    }
    await Promise.all(APP_SHELL.filter(url => !critical.includes(url)).map(async url => {
      try { await cache.add(url); }
      catch (error) { console.warn('[MarketLink PWA] Optional shell asset skipped:', url, error); }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('marketlink-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
        }
        return response;
      }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }
  const isPremiumExecutable = /\/premium-marketlink\.js$/.test(url.pathname);
  if (isPremiumExecutable) {
    // Never let a stale cached premium executable mask a newly deployed
    // bundle. Prefer the network; use the cache only when offline.
    event.respondWith(fetch(request).then(response => {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request)));
    return;
  }
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
