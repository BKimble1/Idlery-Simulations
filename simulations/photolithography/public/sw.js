/*
 * FAB / ONE service worker. It does nothing until the viewer explicitly saves the film for
 * offline use (Watch → Save for offline): the page then downloads this build's files and the
 * narration into a versioned cache, verifies every file's checksum, and only then marks the
 * cache complete. This worker serves from the newest COMPLETE cache, and only when the network
 * fails (the narration, which never changes within a version, is served from the cache first).
 *
 * The worker belongs to the simulation it was built with. At a domain's root it serves the
 * whole origin; inside FAB / ONE (/photolithography/sw.js, registered for the route
 * /photolithography) its caches carry the route's name and it leaves every other page alone.
 */
const BASE = new URL('./', self.location).pathname; // '/' or '/photolithography/'
const APP_PATH = BASE.slice(0, -1); // '' or '/photolithography'
const PREFIX = 'fabone-offline-' + (APP_PATH ? APP_PATH.slice(1).replace(/\//g, '-') + '-' : '');
const MARKER = BASE + '__complete__'; // the same absolute address the page writes
const INDEX = BASE + 'index.html';
/** A page of this simulation: its route, with or without the trailing slash, and below it. */
const ours = (path) => !APP_PATH || path === APP_PATH || path.startsWith(BASE);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function completeCache() {
  const keys = (await caches.keys()).filter((k) => k.startsWith(PREFIX)).sort().reverse();
  for (const k of keys) {
    const c = await caches.open(k);
    if (await c.match(MARKER)) return c;
  }
  return null;
}

/** Answer a Range request (audio seeking) from a cached full response. */
async function ranged(req, res) {
  const range = req.headers.get('range');
  if (!range || !res) return res;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return res;
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // another page of the site (a simulation whose route begins with the same letters)
  if (req.mode === 'navigate' && !ours(url.pathname)) return;
  e.respondWith(
    (async () => {
      const cache = await completeCache();
      if (cache && url.pathname.includes('/narration/')) {
        const hit = await cache.match(url.pathname);
        if (hit) return ranged(req, hit);
      }
      try {
        return await fetch(req);
      } catch (err) {
        if (!cache) throw err;
        const hit = await cache.match(url.pathname);
        if (hit) return ranged(req, hit);
        if (req.mode === 'navigate') {
          const index = await cache.match(INDEX);
          if (index) return index;
        }
        throw err;
      }
    })(),
  );
});
