/// <reference lib="webworker" />

/*
 * The service worker: keeps a copy of the whole game so it plays with no
 * connection. The build (vite.config.ts) fills in the files to keep and a
 * name for this version, which changes whenever any of them does.
 */

declare const self: ServiceWorkerGlobalScope;
declare const __OFFLINE_FILES__: string[];
declare const __OFFLINE_VERSION__: string;

const PREFIX = 'scorpion-';
const CACHE = PREFIX + __OFFLINE_VERSION__;

self.addEventListener('install', (event) => {
  // Takes over once the copy is complete; the next page load is the new version.
  event.waitUntil(store().then(() => self.skipWaiting()));
});

async function store(): Promise<void> {
  const cache = await caches.open(CACHE);
  try {
    await Promise.all(
      __OFFLINE_FILES__.map(async (file) => {
        // Names under assets/ change with their content, so any copy already kept is still right;
        // the rest skip the browser's HTTP cache, which may still hold the last version.
        const response = file.startsWith('assets/')
          ? ((await caches.match(file)) ?? (await fetch(file)))
          : await fetch(file, { cache: 'reload' });
        if (!response.ok) throw new Error(`${file}: ${response.status}`);
        await cache.put(file, response);
      }),
    );
  } catch (e) {
    // Half a copy is no use offline; the browser tries again later.
    await caches.delete(CACHE);
    throw e;
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(removeOld().then(() => self.clients.claim()));
});

/** Deletes old versions, except the newest, which a tab opened before this update may still be using. */
async function removeOld(): Promise<void> {
  const old = (await caches.keys()).filter((key) => key.startsWith(PREFIX) && key !== CACHE);
  await Promise.all(old.slice(0, -1).map((key) => caches.delete(key)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method === 'GET' && new URL(request.url).origin === self.location.origin) event.respondWith(respond(request));
});

async function respond(request: Request): Promise<Response> {
  // The start page, whatever its query (a home screen icon may add one), is index.html.
  const start = new URL(request.url).pathname === new URL(self.registration.scope).pathname;
  const kept =
    (await (await caches.open(CACHE)).match(start ? 'index.html' : request)) ??
    // A tab opened before the last update may still ask for that version's files.
    (await caches.match(request));
  return kept ?? fetch(request);
}

export {};
