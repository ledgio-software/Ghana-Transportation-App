// P1-OFF: lets the web app (the iPhone home-screen app) open with no network. Fares and
// stations are already kept on the phone by the app itself; this keeps the app's own files.
//
// - Pages: from the network when online (so a new version shows at once), else the last copy.
// - /_expo/static and /assets: their names change with every version, so the saved copy is used.
//   When a new version's page arrives, all its screen files (small) are saved too, so screens
//   never opened before still work offline.
// - /api and other websites (Supabase, Google, MET Norway): untouched.
const PAGES = 'gta-pages-v1';
const FILES = 'gta-files-v1';
const MAX_FILES = 150;

// The first visit is not yet handled by this worker, so save the app straight away.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    fetch('/')
      .then(async (response) => {
        if (!response.ok) return;
        const html = await response.clone().text();
        await (await caches.open(PAGES)).put('/', response);
        await saveScreens(html);
      })
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== PAGES && n !== FILES).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_FILES)).map((k) => cache.delete(k)));
}

/** Saves the scripts a page loads and every screen file the main script can load later. */
async function saveScreens(html) {
  const cache = await caches.open(FILES);
  const scripts = [...html.matchAll(/src="(\/_expo\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
  const wanted = new Set(scripts);
  for (const src of scripts) {
    const response = await file(new Request(src)).catch(() => null);
    const text = response ? await response.text() : '';
    for (const m of text.matchAll(/"(\/_expo\/static\/js\/web\/[^"]+\.js)"/g)) wanted.add(m[1]);
  }
  for (const src of wanted) if (!(await cache.match(src))) await file(new Request(src)).catch(() => null);
}

async function page(request, waitUntil) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    // Every page is the same app shell (index.html), so keep one copy.
    if (response.ok) {
      const before = await cache.match('/').then((r) => (r ? r.text() : ''));
      const html = await response.clone().text();
      await cache.put('/', response.clone());
      if (html !== before) waitUntil(saveScreens(html).catch(() => undefined));
    }
    return response;
  } catch (err) {
    const saved = await cache.match('/');
    if (saved) return saved;
    throw err;
  }
}

async function file(request) {
  const cache = await caches.open(FILES);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    void trim(cache);
  }
  return response;
}

async function other(request) {
  const cache = await caches.open(FILES);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const saved = await cache.match(request);
    if (saved) return saved;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') event.respondWith(page(request, (p) => event.waitUntil(p)));
  else if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) event.respondWith(file(request));
  else event.respondWith(other(request));
});
