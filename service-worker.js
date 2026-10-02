const SHELL_CACHE = 'investidor-amg-shell-v3';
const DATA_CACHE = 'investidor-amg-data-v1';
const APP_ROOT = new URL('./', self.registration.scope);
const APP_INDEX = new URL('index.html?v=20261002-0829', APP_ROOT).href;

const SHELL_FILES = [
  APP_ROOT.href,
  APP_INDEX,
  new URL('manifest.json', APP_ROOT).href,
  new URL('icon-192.png', APP_ROOT).href,
  new URL('icon-512.png', APP_ROOT).href,
  new URL('apple-touch-icon.png', APP_ROOT).href
];

const DATA_HOSTS = new Set([
  'api.bcb.gov.br',
  'olinda.bcb.gov.br',
  'api.gold-api.com',
  'api.coingecko.com',
  'economia.awesomeapi.com.br',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'r.jina.ai',
  'api.allorigins.win',
  'api.codetabs.com'
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('investidor-amg-') && ![SHELL_CACHE, DATA_CACHE].includes(key))
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // As telas e arquivos do próprio app usam a cópia local quando não há rede.
  if (url.origin === self.location.origin && url.pathname.startsWith(APP_ROOT.pathname)) {
    if (request.mode === 'navigate') {
      event.respondWith((async () => {
        try {
          const response = await fetch(new Request(APP_INDEX, { cache: 'reload' }));
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(APP_INDEX, response.clone()).catch(() => {});
          }
          return response;
        } catch (error) {
          return await caches.match(APP_INDEX)
            || await caches.match(request)
            || await caches.match(APP_ROOT.href)
            || Response.error();
        }
      })());
      return;
    }

    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const saved = await cache.match(request);
      if (saved) return saved;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        return Response.error();
      }
    })());
    return;
  }

  // Guarda respostas públicas de cotações já consultadas para tentar reutilizá-las offline.
  if (DATA_HOSTS.has(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const cacheKey = new Request(request.url);
      try {
        const response = await fetch(request);
        if (response.ok && response.type !== 'opaque') {
          await cache.put(cacheKey, response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        const saved = await cache.match(cacheKey);
        if (saved) return saved;
        return new Response(
          JSON.stringify({ error: 'offline', message: 'Sem conexão e sem dado salvo para esta consulta.' }),
          { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }
    })());
  }
});
