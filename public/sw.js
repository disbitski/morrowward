const CACHE_PREFIX = "morrowward-";
const SHELL_CACHE = "morrowward-shell-v7";
const RUNTIME_CACHE = "morrowward-runtime-v7";
// Keep approved publications in one registry. The derived paths decide what
// the worker may serve, while every publication and asset hash contributes to
// the cache name. Parity tests fail if a reviewed roster entry or publication
// record is added without updating this registry.
const APPROVED_GREETING_PUBLICATIONS = [
  {
    greetingId: "marcus-aurelius-v1",
    assetId: "morrowward-marcus-welcome",
    revision: "2026-07-15-r1",
    publication: {
      publicPath: "/morrowward-marcus-welcome.publication.json",
      sha256:
        "9828fb899d8651aeecb0e20b77e6e9349bafb2f33a41fb3ee20e1ef93ffae7e3",
    },
    assets: [
      {
        role: "video",
        publicPath: "/morrowward-marcus-welcome.mp4",
        sha256:
          "4a254a2983237eec3bffa97d601413884924c8ff42b585aad6f2560a1a627728",
      },
      {
        role: "captions",
        publicPath: "/morrowward-marcus-welcome.en.vtt",
        sha256:
          "b2e5b45dd0c8584bab44ad281bb78223ff5ec04387a72c48deb6b897f8be97a3",
      },
      {
        role: "poster",
        publicPath: "/morrowward-marcus-welcome-poster.jpg",
        sha256:
          "1d980a1fd25d3bc199dea81778b367ddab905a6e3c12748d1e9bc4b3cc527764",
      },
    ],
  },
  {
    greetingId: "benjamin-franklin-v1",
    assetId: "morrowward-franklin-welcome",
    revision: "2026-07-16-r1",
    publication: {
      publicPath: "/morrowward-franklin-welcome.publication.json",
      sha256:
        "26006f24e3ebfa2a5d28f3c084f801a45c4bc9dfd9272fd694e47ddb2ac56d75",
    },
    assets: [
      {
        role: "video",
        publicPath: "/morrowward-franklin-welcome.mp4",
        sha256:
          "e261c75caead502f2da0efeb25a157f0273427d86495e9d2e39165e74c030b7f",
      },
      {
        role: "captions",
        publicPath: "/morrowward-franklin-welcome.en.vtt",
        sha256:
          "f2be000a2065b8bae7a22315cc20952a3935e386608ed50b8fa12ec2f0389425",
      },
      {
        role: "poster",
        publicPath: "/morrowward-franklin-welcome-poster.jpg",
        sha256:
          "f007a175b2d894b90420a0b03dad315630094e85936e2aa86f41c307970dc113",
      },
    ],
  },
];
const MEDIA_CACHE_FINGERPRINT = APPROVED_GREETING_PUBLICATIONS.map(
  (publication) =>
    [
      publication.assetId,
      publication.revision,
      publication.publication.sha256.slice(0, 8),
      ...publication.assets.map((asset) => asset.sha256.slice(0, 8)),
    ].join("-"),
).join("-");
const MEDIA_CACHE = `${CACHE_PREFIX}media-${MEDIA_CACHE_FINGERPRINT}`;
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
// Warm only lightweight provenance, poster, and caption files. MP4s are cached
// lazily after a person chooses to play one, avoiding a multi-video download on
// first navigation as the reviewed historical roster grows.
const OPTIONAL_GREETING_WARMUP = APPROVED_GREETING_PUBLICATIONS.flatMap(
  (publication) => [
    publication.publication.publicPath,
    ...publication.assets
      .filter((asset) => asset.role !== "video")
      .map((asset) => asset.publicPath),
  ],
);
const OPTIONAL_GREETING_VIDEOS = APPROVED_GREETING_PUBLICATIONS.flatMap(
  (publication) =>
    publication.assets
      .filter((asset) => asset.role === "video")
      .map((asset) => asset.publicPath),
);
const OPTIONAL_GREETING_MEDIA = [
  ...OPTIONAL_GREETING_WARMUP,
  ...OPTIONAL_GREETING_VIDEOS,
];
const OPTIONAL_GREETING_PATHS = new Set(OPTIONAL_GREETING_MEDIA);
const OPTIONAL_GREETING_VIDEO_PATHS = new Set(OPTIONAL_GREETING_VIDEOS);
let optionalMediaCacheTask = null;
const fullMediaCacheTasks = new Map();

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
        OPTIONAL_GREETING_WARMUP.map(async (path) => {
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

function ensureFullGreetingVideoCached(request) {
  const cacheRequest = fullMediaRequest(request);
  const url = new URL(cacheRequest.url);
  if (
    url.origin !== self.location.origin ||
    !OPTIONAL_GREETING_VIDEO_PATHS.has(url.pathname)
  ) {
    return Promise.resolve(false);
  }

  const existing = fullMediaCacheTasks.get(cacheRequest.url);
  if (existing) return existing;

  const task = (async () => {
    const cached = await safeMediaCacheMatch(cacheRequest);
    if (cached?.status === 200) return true;

    try {
      const response = await fetch(cacheRequest, { cache: "reload" });
      if (response.status !== 200) return false;
      return await safePutMedia(cacheRequest, response);
    } catch {
      return false;
    }
  })();

  fullMediaCacheTasks.set(cacheRequest.url, task);
  const clearTask = () => {
    if (fullMediaCacheTasks.get(cacheRequest.url) === task) {
      fullMediaCacheTasks.delete(cacheRequest.url);
    }
  };
  void task.then(clearTask, clearTask);
  return task;
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

async function handleRangeMediaRequest(request, scheduleBackground) {
  const rangeHeader = request.headers.get("range");
  const cacheRequest = fullMediaRequest(request);
  let networkResponse = null;

  const cachedFullResponse = await safeMediaCacheMatch(cacheRequest);
  if (cachedFullResponse?.status === 200) {
    return createByteRangeResponse(cachedFullResponse, rangeHeader);
  }

  try {
    networkResponse = await fetch(request);

    // A 206 is already the exact response the media element requested. Return
    // it untouched so playback is never delayed. Cache Storage cannot store
    // partial responses, so the fetch-event lifetime separately keeps one
    // deduplicated, no-Range GET alive for a future offline replay.
    if (networkResponse.status === 206) {
      scheduleBackground?.(ensureFullGreetingVideoCached(cacheRequest));
      return networkResponse;
    }

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

async function handleMediaRequest(request, scheduleBackground) {
  return request.headers.has("range")
    ? handleRangeMediaRequest(request, scheduleBackground)
    : handleFullMediaRequest(request);
}

function handleMediaFetchEvent(event) {
  const backgroundTasks = [];
  const responsePromise = handleMediaRequest(event.request, (task) => {
    backgroundTasks.push(task);
  });

  // Both lifecycle methods are called synchronously during event dispatch.
  // The response promise resolves as soon as the requested 206 is available;
  // only waitUntil observes the later full-file cache task.
  event.respondWith(responsePromise);
  event.waitUntil(
    responsePromise
      .catch(() => undefined)
      .then(() => Promise.allSettled(backgroundTasks))
      .then(() => undefined),
  );
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
    handleMediaFetchEvent(event);
    return;
  }

  // Warm only lightweight approved greeting metadata after the core worker is
  // installed. Videos remain lazy until explicit playback.
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
