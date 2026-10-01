// Guarda la app en el teléfono para que abra sin señal. Los datos no pasan por acá:
// los pedidos al servidor van siempre a la red.
// Cambiar VERSION en cada publicación para que los teléfonos tomen los archivos nuevos.
const VERSION = 'seaveapp-v1';
const ARCHIVOS = ['./', './index.html', './app.css', './app.js', './calc.js', './config.js',
  './manifest.webmanifest', './assets/logo-seave.png', './assets/icon-192.png', './assets/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((guardado) => guardado || fetch(e.request))
  );
});
