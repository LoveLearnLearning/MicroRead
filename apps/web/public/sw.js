const CACHE_NAME = "micro-read-v1";
const APP_SHELL = ["/", "/library", "/cards", "/topics", "/settings", "/manifest.webmanifest"];
const IS_TAURI_DESKTOP = self.location.hostname === "tauri.localhost";

if (IS_TAURI_DESKTOP) {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("micro-read-"))
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    })());
  });
} else {

  self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

    event.respondWith(
      request.mode === "navigate"
        ? fetch(request)
            .then((response) => {
              const copy = response.clone();
              void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
              return response;
            })
            .catch(async () => (await caches.match(request)) || (await caches.match("/library")) || Response.error())
        : caches.match(request).then((cached) => {
            const network = fetch(request).then((response) => {
              if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
              return response;
            });
            return cached || network;
          }),
    );
  });
}
