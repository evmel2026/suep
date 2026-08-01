/* ═══════════════════════════════════════════════════════════════════
   SUEP · Service worker
   ───────────────────────────────────────────────────────────────────
   PARA QUÉ SIRVE: Android/Chrome solo ofrece "Instalar aplicación" (con
   ícono propio, que sobrevive al reinicio del teléfono) si además del
   manifest.json hay un service worker registrado. Este es ese archivo.

   IMPORTANTE — NO ROMPE LA ACTUALIZACIÓN AUTOMÁTICA:
   La estrategia es SIEMPRE RED PRIMERO. Cada vez que se abre la app, el
   archivo se pide a GitHub como hasta ahora; la copia guardada se usa
   ÚNICAMENTE si no hay internet. Así el chequeo de versión y la
   actualización automática siguen funcionando exactamente igual, y de
   paso la app abre aunque el celular esté sin señal.

   NO guarda ni toca datos: los registros viven en Supabase y en el
   localStorage del dispositivo, que el service worker no maneja.
   ═══════════════════════════════════════════════════════════════════ */

const CACHE = 'suep-shell-v1';

// Lo único que se guarda para poder abrir sin internet.
const BASICOS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      await c.addAll(BASICOS);
    } catch (_) { /* si algo no está, no importa: se guarda al usarse */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Borrar cachés de versiones anteriores del service worker
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Solo GET del propio sitio. Todo lo demás (Supabase, CDN, GitHub) va
  // directo a la red sin que el service worker se meta.
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      // ── RED PRIMERO (esto es lo que mantiene vivo el auto-update) ──
      const resp = await fetch(req, { cache: 'no-store' });
      if (resp && resp.ok && resp.type === 'basic') {
        try {
          const c = await caches.open(CACHE);
          c.put(req, resp.clone());
        } catch (_) { }
      }
      return resp;
    } catch (_) {
      // ── Sin internet: se usa la copia guardada ──
      const c = await caches.open(CACHE);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const idx = await c.match('./index.html');
        if (idx) return idx;
      }
      return new Response('Sin conexión', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

// Permite que la app fuerce la limpieza de la caché al actualizarse.
self.addEventListener('message', (e) => {
  if (e.data === 'suep-limpiar-cache') {
    caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k))));
  }
});
