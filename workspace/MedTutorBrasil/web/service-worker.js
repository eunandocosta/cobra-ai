const CACHE_NAME = 'medtutor-static-v127';
const APP_SHELL = [
  '/',
  '/index.html',
  '/landing.html',
  '/material-icons.css?v=20261005-material-symbols-v3',
  '/material-icons.js?v=20261009-compact-sidebar-tooltips-v1',
  '/landing.css?v=20260922-landing-v1',
  '/styles.css?v=20261009-sidebar-icons-larger-v1',
  '/academic-report-renderer.js?v=20260922-report-print-v5',
  '/exam-study-planner.js?v=20260927-sce-review-deck-v2',
  '/gamification-rules.js?v=20261006-linear-level-curve-v1',
  '/announcement-prompt.js?v=20261005-consent-prompt-v1',
  '/app.min.js?v=20261009-sidebar-study-dropdown-v1',
  '/manifest.webmanifest',
  '/icons/medtutor-icon.svg?v=20261005-ecg-v1'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Conteúdo pessoal e geração por IA nunca são persistidos no cache do PWA.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(request)) || caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});
