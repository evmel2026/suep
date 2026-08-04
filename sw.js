/* ═══════════════════════════════════════════════════════════════════════════
   SUEP — Service worker  ·  v1.5.89
   ---------------------------------------------------------------------------
   PARA QUÉ SIRVE ESTE ARCHIVO
   Es lo que le permite al celular INSTALAR SUEP como aplicación (ícono propio
   en el escritorio) y abrirla aunque no haya internet.

   QUÉ SE CORRIGE EN ESTA VERSIÓN
   Antes, el teléfono podía quedarse mostrando la copia guardada del archivo de
   la app. Resultado: aunque en GitHub estuviera la versión nueva, el celular
   seguía abriendo la vieja y el cartel de "actualizá" volvía una y otra vez.

   AHORA: el archivo de la app (index.html) SIEMPRE se pide a internet y nunca
   se responde desde la copia guardada mientras haya conexión. La copia queda
   guardada solo como respaldo, para cuando no hay señal.

   ⚠️ Este archivo NO toca ni guarda datos: los registros viven en Supabase.
   Subilo a GitHub junto al index.html (misma carpeta).
   ═══════════════════════════════════════════════════════════════════════════ */

const CACHE = 'suep-v1-5-89';
const HTML_RESPALDO = 'suep-app-html';

// Al instalarse, tomar el control enseguida (sin esperar a que cierren la app)
self.addEventListener('install', () => { self.skipWaiting(); });

// Al activarse, borrar las cachés de versiones anteriores
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const claves = await caches.keys();
      await Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k)));
    } catch (_) {}
    try { await self.clients.claim(); } catch (_) {}
  })());
});

// La app puede pedirle que se active ya mismo
self.addEventListener('message', event => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  const esDocumento =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html');

  // ── EL ARCHIVO DE LA APP: siempre de internet ──
  if (esDocumento) {
    event.respondWith((async () => {
      try {
        const fresco = await fetch(new Request(req.url, { cache: 'no-store' }));
        if (fresco && fresco.ok) {
          try {
            const c = await caches.open(CACHE);
            await c.put(HTML_RESPALDO, fresco.clone());
          } catch (_) {}
        }
        return fresco;
      } catch (_) {
        // Sin conexión: se usa la última copia guardada
        try {
          const c = await caches.open(CACHE);
          const guardado = await c.match(HTML_RESPALDO);
          if (guardado) return guardado;
        } catch (__) {}
        return new Response(
          '<!doctype html><meta charset="utf-8"><title>SUEP</title>' +
          '<body style="font-family:system-ui;background:#0d1a2d;color:#e8eef6;padding:40px;text-align:center">' +
          '<h2>SUEP</h2><p>No hay conexión y todavía no hay una copia guardada.<br>' +
          'Conectate a internet y volvé a abrir la app.</p></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // ── El resto (manifest, íconos): internet primero, copia guardada de respaldo ──
  event.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r && r.ok && url.origin === self.location.origin) {
        try {
          const c = await caches.open(CACHE);
          await c.put(req, r.clone());
        } catch (_) {}
      }
      return r;
    } catch (e) {
      try {
        const c = await caches.open(CACHE);
        const hit = await c.match(req);
        if (hit) return hit;
      } catch (_) {}
      throw e;
    }
  })());
});
