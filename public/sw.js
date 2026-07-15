const CACHE_PREFIX = "morrowward-";
const SHELL_CACHE = "morrowward-shell-v6";
const RUNTIME_CACHE = "morrowward-runtime-v6";
// The publication JSON and approved asset hash prefixes bind this cache to one
// exact bundle. Any metadata or media change must use a new cache name.
const MEDIA_CACHE =
  "morrowward-media-marcus-2026-07-15-r1-9828fb89-4a254a29-b2e5b45d-1d980a1f";
const MAX_RUNTIME_ENTRIES = 80;
const OPTIONAL_MEDIA_CACHE_TIMEOUT_MS = 10_000;

// These files are required to open Morrowward offline. A failure here should
// prevent an incomplete shell from being installed.
const CORE_APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/dave-age-10-commodore-64.jpg",
];

// The greeting enriches the experience but is not required to use the app.
// Cache each file independently so a large-media/CDN failure cannot block the
// service-worker install or the deterministic financial simulator.
const OPTIONAL_GREETING_MEDIA = [
  "/morrowward-marcus-welcome.publication.json",
  "/morrowward-marcus-welcome-poster.jpg",
  "/morrowward-marcus-welcome.mp4",
  "/morrowward-marcus-welcome.en.vtt",
];
const OPTIONAL_GREETING_PATHS = new Set(OPTIONAL_GREETING_MEDIA);
let optionalMediaCacheTask = null;

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(CORE_APP_SHELL);

  // The rendered document names the hashed CSS/JS chunks required to boot.
  // Cache those during install so the first post-install offline launch works.
  let response;
  try {
    response = await fetch("/", { cache: "reload" });
  } catch {
    return;
  }
  if (!response.ok) return;
  const html = await response.text();
  const assetPaths = Array.from(
    html.matchAll(/(?:href|src)=["']([^"']+)["']/giu),
    (match) => match[1],
  ).filter(
    (path) =>
      path.startsWith("/assets/") || path.startsWith("/_next/static/"),
  );
  await Promise.allSettled(
    Array.from(new Set(assetPaths)).map((path) => cache.add(path)),
  );
}

async function precacheOptionalMedia() {
  const controller = new AbortController();
  let timeoutId;
  try {
    const cacheWork = (async () => {
      const cache = await caches.open(MEDIA_CACHE);
      await Promise.allSettled(
        OPTIONAL_GREETING_MEDIA.map(async (path) => {
          if (await cache.match(path)) return;
          const response = await fetch(path, {
            cache: "reload",
            signal: controller.signal,
          });
          if (response.status !== 200) {
            throw new Error(`Optional media returned ${response.status}.`);
          }
          await cache.put(path, response);
        }),
      );
    })();
    const timeout = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve(undefined);
      }, OPTIONAL_MEDIA_CACHE_TIMEOUT_MS);
    });
    await Promise.race([cacheWork, timeout]);
  } catch {
    // Optional media failures must never affect the core application.
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function ensureOptionalMediaCached() {
  if (optionalMediaCacheTask) return optionalMediaCacheTask;
  optionalMediaCacheTask = precacheOptionalMedia().finally(() => {
    optionalMediaCacheTask = null;
  });
  return optionalMediaCacheTask;
}

function canCacheResponse(request, response) {
  return (
    request.method === "GET" &&
    !request.headers.has("range") &&
    response.status === 200
  );
}

async function putRuntime(request, response) {
  if (!canCacheResponse(request, response)) return false;
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response);
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES)).map((key) =>
      cache.delete(key),
    ),
  );
  return true;
}

// Cache storage is an enhancement. A quota, eviction, or Cache API failure
// must never replace a valid network response with an offline error.
async function safePutRuntime(request, response) {
  try {
    return await putRuntime(request, response);
  } catch {
    return false;
  }
}

async function safePutMedia(request, response) {
  if (!canCacheResponse(request, response)) return false;
  try {
    const cache = await caches.open(MEDIA_CACHE);
    await cache.put(request, response);
    return true;
  } catch {
    return false;
  }
}

async function safeCacheMatch(request, options) {
  try {
    return (await caches.match(request, options)) ?? null;
  } catch {
    return null;
  }
}

async function safeMediaCacheMatch(request) {
  try {
    const cache = await caches.open(MEDIA_CACHE);
    return (await cache.match(request)) ?? null;
  } catch {
    return null;
  }
}

function fullMediaRequest(request) {
  return new Request(request.url, {
    method: "GET",
    credentials: request.credentials,
  });
}

function parseSingleByteRange(rangeHeader, totalBytes) {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) return null;
  const match = /^bytes\s*=\s*(\d*)-(\d*)$/iu.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, totalBytes - suffixLength),
      end: totalBytes - 1,
    };
  }

  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start >= totalBytes) return null;
  const requestedEnd = match[2] ? Number(match[2]) : totalBytes - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, totalBytes - 1) };
}

function copyEntityHeaders(source) {
  const headers = new Headers();
  for (const name of [
    "cache-control",
    "content-disposition",
    "content-type",
    "etag",
    "expires",
    "last-modified",
  ]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function createByteRangeResponse(fullResponse, rangeHeader) {
  const body = await fullResponse.arrayBuffer();
  const totalBytes = body.byteLength;
  const range = parseSingleByteRange(rangeHeader, totalBytes);
  const headers = copyEntityHeaders(fullResponse.headers);
  headers.set("accept-ranges", "bytes");

  if (!range) {
    headers.set("content-range", `bytes */${totalBytes}`);
    headers.set("content-length", "0");
    return new Response(null, {
      status: 416,
      statusText: "Range Not Satisfiable",
      headers,
    });
  }

  const partialBody = body.slice(range.start, range.end + 1);
  headers.set("content-range", `bytes ${range.start}-${range.end}/${totalBytes}`);
  headers.set("content-length", String(partialBody.byteLength));
  return new Response(partialBody, {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}

function offlineResponse() {
  return new Response("Offline", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function handleRangeMediaRequest(request) {
  const rangeHeader = request.headers.get("range");
  const cacheRequest = fullMediaRequest(request);
  let networkResponse = null;

  const cachedFullResponse = await safeMediaCacheMatch(cacheRequest);
  if (cachedFullResponse?.status === 200) {
    return createByteRangeResponse(cachedFullResponse, rangeHeader);
  }

  try {
    networkResponse = await fetch(request);

    // A 206 is already the exact response the media element requested. Cache
    // storage rejects partial responses, so return it untouched and uncached.
    if (networkResponse.status === 206) return networkResponse;

    if (networkResponse.status === 200) {
      const rangeSource = networkResponse.clone();
      await safePutMedia(cacheRequest, networkResponse.clone());
      return await createByteRangeResponse(rangeSource, rangeHeader);
    }

    // Client errors (including a server-generated 416) are authoritative.
    if (networkResponse.status < 500) return networkResponse;
  } catch {
    // Fall through to the full cached object when the network is unavailable.
  }

  const cached = await safeMediaCacheMatch(cacheRequest);
  if (cached?.status === 200) {
    return createByteRangeResponse(cached, rangeHeader);
  }
  return networkResponse ?? offlineResponse();
}

async function handleFullMediaRequest(request) {
  const cacheRequest = fullMediaRequest(request);
  const cached = await safeMediaCacheMatch(cacheRequest);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      await safePutMedia(cacheRequest, response.clone());
    }
    return response;
  } catch {
    return (await safeMediaCacheMatch(cacheRequest)) ?? offlineResponse();
  }
}

async function handleMediaRequest(request) {
  return request.headers.has("range")
    ? handleRangeMediaRequest(request)
    : handleFullMediaRequest(request);
}

async function handleCacheFirstRequest(request) {
  const cached = await safeCacheMatch(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      await safePutRuntime(request, response.clone());
    }
    return response;
  } catch {
    return offlineResponse();
  }
}

async function handleNetworkFirstRequest(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await safePutRuntime(request, response.clone());
    }
    return response;
  } catch {
    const cached = await safeCacheMatch(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      return (
        (await safeCacheMatch("/", { cacheName: SHELL_CACHE })) ??
        offlineResponse()
      );
    }
    return offlineResponse();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
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
                key !== RUNTIME_CACHE &&
                key !== MEDIA_CACHE,
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

  if (OPTIONAL_GREETING_PATHS.has(url.pathname)) {
    event.respondWith(handleMediaRequest(event.request));
    return;
  }

  // Warm the immutable greeting bundle only after the core worker is already
  // installed. waitUntil keeps this optional background work alive without
  // delaying the navigation response or risking the core install.
  if (event.request.mode === "navigate") {
    event.waitUntil(ensureOptionalMediaCached());
  }

  const staticAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|png|jpe?g|webp|json)$/iu.test(url.pathname);

  event.respondWith(
    staticAsset
      ? handleCacheFirstRequest(event.request)
      : handleNetworkFirstRequest(event.request),
  );
});
