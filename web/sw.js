// Offline: cache the whole app on install, serve it cache-first. VERSION is stamped per deploy by scripts/build.mjs.
const VERSION = 'dev';
const FILES = ['./', './style.css', './app.js', './logic.js', './i18n.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // every page load gets the cached app shell ('./'); hosts like Cloudflare redirect /index.html -> /, and a cached redirect breaks navigation
  const req = e.request.mode === 'navigate' ? './' : e.request;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
