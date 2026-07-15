const CACHE_PREFIX = "morrowward-";
const SHELL_CACHE = "morrowward-shell-v4";
const RUNTIME_CACHE = "morrowward-runtime-v4";
const MAX_RUNTIME_ENTRIES = 80;
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/dave-age-10-commodore-64.jpg",
];

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(APP_SHELL);

  // The rendered document names the hashed CSS/JS chunks required to boot.
  // Cache those during install so the first post-install offline launch works.
  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) return;
  const html = await response.text();
  const assetPaths = Array.from(
    html.matchAll(/(?:href|src)=["']([^"']+)["']/giu),
    (match) => match[1],
  ).filter(
    (path) =>
      path.startsWith("/assets/") || path.startsWith("/_next/static/"),
  );
  await Promise.all(
    Array.from(new Set(assetPaths)).map((path) =>
      cache.add(path).catch(() => undefined),
    ),
  );
}

async function putRuntime(request, response) {
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response);
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES)).map((key) =>
      cache.delete(key),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) &&
                key !== SHELL_CACHE &&
                key !== RUNTIME_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  const staticAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|png|jpe?g|webp|json)$/iu.test(url.pathname);

  if (staticAsset) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) {
          await putRuntime(event.request, response.clone());
        }
        return response;
      }),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (response.ok) {
          await putRuntime(event.request, response.clone());
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then(async (cached) => {
            if (cached) return cached;
            if (event.request.mode === "navigate") {
              return (await caches.match("/", { cacheName: SHELL_CACHE })) ?? new Response("Offline", { status: 503 });
            }
            return new Response("Offline", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            });
          }),
      ),
  );
});
