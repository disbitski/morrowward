import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { GREETING_ROSTER } from "../app/components/HistoricalGreeting";

const serviceWorkerSource = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);

type ApprovedGreetingPublication = {
  greetingId: string;
  assetId: string;
  revision: string;
  publication: {
    publicPath: string;
    sha256: string;
  };
  assets: Array<{
    role: string;
    publicPath: string;
    sha256: string;
  }>;
};

type PublicationRecord = {
  assetId: string;
  revision: string;
  status: string;
  assets: ApprovedGreetingPublication["assets"];
};

const approvedPublicationRecords = readdirSync(
  new URL("../app/data/", import.meta.url),
)
  .filter((filename) => filename.endsWith(".publication.json"))
  .map((filename) => {
    const appBytes = readFileSync(
      new URL(`../app/data/${filename}`, import.meta.url),
    );
    const publicBytes = readFileSync(
      new URL(`../public/${filename}`, import.meta.url),
    );
    const record = JSON.parse(appBytes.toString("utf8")) as PublicationRecord;
    return {
      filename,
      appBytes,
      publicBytes,
      record,
      publicationSha256: createHash("sha256")
        .update(publicBytes)
        .digest("hex"),
    };
  })
  .filter(({ record }) => record.status === "approved");

type CacheDouble = {
  addAll: (paths: string[]) => Promise<void>;
  add: (path: string) => Promise<void>;
  match: (request: Request | string) => Promise<Response | undefined>;
  put: (request: Request | string, response: Response) => Promise<void>;
  keys: () => Promise<Request[]>;
  delete: (request: Request) => Promise<boolean>;
};

type CacheStorageDouble = {
  open: (name: string) => Promise<CacheDouble>;
  match: (request: Request | string, options?: CacheQueryOptions) => Promise<Response | undefined>;
  keys: () => Promise<string[]>;
  delete: (name: string) => Promise<boolean>;
};

type ServiceWorkerInternals = {
  APPROVED_GREETING_PUBLICATIONS: ApprovedGreetingPublication[];
  CORE_APP_SHELL: string[];
  OPTIONAL_GREETING_WARMUP: string[];
  OPTIONAL_GREETING_VIDEOS: string[];
  OPTIONAL_GREETING_MEDIA: string[];
  MEDIA_CACHE: string;
  OPTIONAL_MEDIA_CACHE_TIMEOUT_MS: number;
  precacheShell: () => Promise<void>;
  precacheOptionalMedia: () => Promise<void>;
  canCacheResponse: (request: Request, response: Response) => boolean;
  parseSingleByteRange: (
    rangeHeader: string,
    totalBytes: number,
  ) => { start: number; end: number } | null;
  createByteRangeResponse: (
    response: Response,
    rangeHeader: string,
  ) => Promise<Response>;
  handleMediaRequest: (request: Request) => Promise<Response>;
  handleNetworkFirstRequest: (request: Request) => Promise<Response>;
};

function createCacheDouble(
  overrides: Partial<CacheDouble> = {},
): CacheDouble {
  return {
    addAll: vi.fn(async () => undefined),
    add: vi.fn(async () => undefined),
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    ...overrides,
  };
}

function createCacheStorageDouble(
  cache: CacheDouble,
  overrides: Partial<CacheStorageDouble> = {},
): CacheStorageDouble {
  return {
    open: vi.fn(async () => cache),
    match: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    ...overrides,
  };
}

function loadServiceWorker(
  fetchImplementation: typeof fetch,
  cacheStorage: CacheStorageDouble,
) {
  const listeners = new Map<string, (event: unknown) => void>();
  const workerSelf = {
    location: { origin: "https://morrowward.test" },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: vi.fn(
      (name: string, listener: (event: unknown) => void) => {
        listeners.set(name, listener);
      },
    ),
  };
  const sandbox: Record<string, unknown> = {
    self: workerSelf,
    caches: cacheStorage,
    fetch: fetchImplementation,
    Request,
    Response,
    Headers,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  };

  runInNewContext(
    `${serviceWorkerSource}\n` +
      `globalThis.__morrowwardTest = {` +
      `APPROVED_GREETING_PUBLICATIONS, CORE_APP_SHELL, ` +
      `OPTIONAL_GREETING_WARMUP, OPTIONAL_GREETING_VIDEOS, OPTIONAL_GREETING_MEDIA, ` +
      `MEDIA_CACHE, OPTIONAL_MEDIA_CACHE_TIMEOUT_MS, ` +
      `precacheShell, precacheOptionalMedia, ` +
      `canCacheResponse, parseSingleByteRange, createByteRangeResponse, ` +
      `handleMediaRequest, handleMediaFetchEvent, handleNetworkFirstRequest };`,
    sandbox,
    { filename: "public/sw.js" },
  );

  return {
    internals: sandbox.__morrowwardTest as ServiceWorkerInternals,
    listeners,
    workerSelf,
  };
}

function dispatchFetchEvent(
  listeners: Map<string, (event: unknown) => void>,
  request: Request,
) {
  const listener = listeners.get("fetch");
  if (!listener) throw new Error("The service worker fetch listener is missing.");

  const responseWork: Array<Promise<Response>> = [];
  const lifetimeWork: Array<Promise<unknown>> = [];
  let dispatching = true;
  let respondWithCalledDuringDispatch = false;
  let waitUntilCalledDuringDispatch = false;

  listener({
    request,
    respondWith(work: Promise<Response>) {
      respondWithCalledDuringDispatch = dispatching;
      responseWork.push(Promise.resolve(work));
    },
    waitUntil(work: Promise<unknown>) {
      waitUntilCalledDuringDispatch = dispatching;
      lifetimeWork.push(Promise.resolve(work));
    },
  });
  dispatching = false;

  if (responseWork.length !== 1 || lifetimeWork.length !== 1) {
    throw new Error("The media fetch event was not fully handled.");
  }
  return {
    response: responseWork[0] as Promise<Response>,
    lifetime: lifetimeWork[0] as Promise<unknown>,
    respondWithCalledDuringDispatch,
    waitUntilCalledDuringDispatch,
  };
}

describe("Morrowward service worker", () => {
  it("keeps every approved publication and roster asset registered together", () => {
    const cache = createCacheDouble();
    const cacheStorage = createCacheStorageDouble(cache);
    const fetchImplementation = vi.fn(async () =>
      new Response("unused"),
    ) as unknown as typeof fetch;
    const { internals } = loadServiceWorker(
      fetchImplementation,
      cacheStorage,
    );

    const expected = approvedPublicationRecords.map(
      ({ filename, appBytes, publicBytes, record, publicationSha256 }) => {
        expect(publicBytes.equals(appBytes)).toBe(true);
        const greeting = GREETING_ROSTER.find(
          (entry) => entry.publicationSrc === `/${filename}`,
        );
        if (!greeting) {
          throw new Error(
            `Approved publication ${filename} is missing from the greeting roster.`,
          );
        }
        for (const asset of record.assets) {
          const bytes = readFileSync(
            new URL(`../public/${asset.publicPath.slice(1)}`, import.meta.url),
          );
          expect(createHash("sha256").update(bytes).digest("hex")).toBe(
            asset.sha256,
          );
        }

        return {
          greetingId: greeting.id,
          assetId: record.assetId,
          revision: record.revision,
          publication: {
            publicPath: `/${filename}`,
            sha256: publicationSha256,
          },
          assets: record.assets.map(({ role, publicPath, sha256 }) => ({
            role,
            publicPath,
            sha256,
          })),
        };
      },
    );

    const byAssetId = (
      left: ApprovedGreetingPublication,
      right: ApprovedGreetingPublication,
    ) => left.assetId.localeCompare(right.assetId);
    expect(
      [...internals.APPROVED_GREETING_PUBLICATIONS].sort(byAssetId),
    ).toEqual([...expected].sort(byAssetId));
    expect(
      internals.APPROVED_GREETING_PUBLICATIONS.map(
        (publication) => publication.greetingId,
      ).sort(),
    ).toEqual(GREETING_ROSTER.map((greeting) => greeting.id).sort());

    for (const greeting of GREETING_ROSTER) {
      const registered = internals.APPROVED_GREETING_PUBLICATIONS.find(
        (publication) => publication.greetingId === greeting.id,
      );
      expect(registered?.publication.publicPath).toBe(greeting.publicationSrc);
      expect(registered?.assets.map((asset) => asset.publicPath)).toEqual(
        expect.arrayContaining([
          greeting.videoSrc,
          greeting.captionsSrc,
          greeting.posterSrc,
        ]),
      );
    }
  });

  it("installs the core shell even when every optional greeting file fails", async () => {
    const add = vi.fn(async () => undefined);
    const cache = createCacheDouble({ add });
    const cacheStorage = createCacheStorageDouble(cache);
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.includes("morrowward-marcus-welcome") ||
        url.includes("morrowward-franklin-welcome")
      ) {
        throw new Error("optional media unavailable");
      }
      return new Response(
        '<link href="/_next/static/app.css"><script src="/assets/app.js"></script>',
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { internals, listeners } = loadServiceWorker(
      fetchImplementation,
      cacheStorage,
    );

    let installWork: Promise<unknown> | undefined;
    listeners.get("install")?.({
      waitUntil(promise: Promise<unknown>) {
        installWork = promise;
      },
    });
    await expect(installWork).resolves.toBeUndefined();
    expect(add).not.toHaveBeenCalledWith(
      "/morrowward-marcus-welcome.mp4",
    );
    await expect(internals.precacheOptionalMedia()).resolves.toBeUndefined();
    expect(cache.addAll).toHaveBeenCalledWith(internals.CORE_APP_SHELL);
    expect(internals.CORE_APP_SHELL).not.toContain(
      "/morrowward-marcus-welcome.mp4",
    );
    expect(internals.OPTIONAL_GREETING_MEDIA).toContain(
      "/morrowward-marcus-welcome.mp4",
    );
    expect(internals.OPTIONAL_GREETING_VIDEOS).toEqual([
      "/morrowward-marcus-welcome.mp4",
      "/morrowward-franklin-welcome.mp4",
    ]);
    for (const videoPath of internals.OPTIONAL_GREETING_VIDEOS) {
      expect(internals.OPTIONAL_GREETING_WARMUP).not.toContain(videoPath);
    }
    for (const path of internals.OPTIONAL_GREETING_WARMUP) {
      expect(fetchImplementation).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ cache: "reload" }),
      );
    }
    for (const videoPath of internals.OPTIONAL_GREETING_VIDEOS) {
      expect(fetchImplementation).not.toHaveBeenCalledWith(
        videoPath,
        expect.anything(),
      );
    }
    expect(cacheStorage.open).toHaveBeenCalledWith(internals.MEDIA_CACHE);
    for (const publication of internals.APPROVED_GREETING_PUBLICATIONS) {
      expect(internals.MEDIA_CACHE).toContain(publication.assetId);
      expect(internals.MEDIA_CACHE).toContain(publication.revision);
      expect(internals.MEDIA_CACHE).toContain(
        publication.publication.sha256.slice(0, 8),
      );
      for (const asset of publication.assets) {
        expect(internals.MEDIA_CACHE).toContain(asset.sha256.slice(0, 8));
      }
    }
    expect(add).toHaveBeenCalledWith("/_next/static/app.css");
    expect(add).toHaveBeenCalledWith("/assets/app.js");
  });

  it("returns a successful network 206 untouched instead of caching the partial response", async () => {
    const put = vi.fn(async () => {
      throw new Error("a 206 must not be written to Cache Storage");
    });
    const cache = createCacheDouble({ put });
    const cacheStorage = createCacheStorageDouble(cache);
    const networkResponse = new Response(Uint8Array.from([2, 3, 4]), {
      status: 206,
      headers: {
        "content-range": "bytes 2-4/10",
        "content-type": "video/mp4",
      },
    });
    const fetchImplementation = vi.fn(
      async () => networkResponse,
    ) as unknown as typeof fetch;
    const { internals } = loadServiceWorker(
      fetchImplementation,
      cacheStorage,
    );
    const request = new Request(
      "https://morrowward.test/morrowward-marcus-welcome.mp4",
      { headers: { range: "bytes=2-4" } },
    );

    const response = await internals.handleMediaRequest(request);

    expect(response).toBe(networkResponse);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      2, 3, 4,
    ]);
    expect(put).not.toHaveBeenCalled();
  });

  it("plays the first online ranges immediately, fills one full cache, and replays offline", async () => {
    const origin = "https://morrowward.test";
    const videoUrl = `${origin}/morrowward-marcus-welcome.mp4`;
    const fullBody = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const stored = new Map<string, Response>();
    const cacheKey = (request: Request | string) =>
      request instanceof Request
        ? request.url
        : new URL(request, origin).href;
    const match = vi.fn(async (request: Request | string) =>
      stored.get(cacheKey(request))?.clone(),
    );
    const put = vi.fn(
      async (request: Request | string, response: Response) => {
        stored.set(cacheKey(request), response.clone());
      },
    );
    const cache = createCacheDouble({ match, put });
    const cacheStorage = createCacheStorageDouble(cache);

    let offline = false;
    let resolveFullFetch: ((response: Response) => void) | undefined;
    const pendingFullFetch = new Promise<Response>((resolve) => {
      resolveFullFetch = resolve;
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void init;
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(String(input), origin));
        if (offline) throw new TypeError("offline");
        const range = request.headers.get("range");
        if (range === "bytes=0-2") {
          return new Response(fullBody.slice(0, 3), {
            status: 206,
            headers: {
              "content-range": "bytes 0-2/10",
              "content-type": "video/mp4",
            },
          });
        }
        if (range === "bytes=3-5") {
          return new Response(fullBody.slice(3, 6), {
            status: 206,
            headers: {
              "content-range": "bytes 3-5/10",
              "content-type": "video/mp4",
            },
          });
        }
        expect(request.headers.has("range")).toBe(false);
        return pendingFullFetch;
      },
    );
    const { listeners } = loadServiceWorker(
      fetchMock as unknown as typeof fetch,
      cacheStorage,
    );

    const firstPlay = dispatchFetchEvent(
      listeners,
      new Request(videoUrl, { headers: { range: "bytes=0-2" } }),
    );
    const concurrentPlay = dispatchFetchEvent(
      listeners,
      new Request(videoUrl, { headers: { range: "bytes=3-5" } }),
    );

    expect(firstPlay.respondWithCalledDuringDispatch).toBe(true);
    expect(firstPlay.waitUntilCalledDuringDispatch).toBe(true);
    expect(concurrentPlay.waitUntilCalledDuringDispatch).toBe(true);

    const [firstResponse, concurrentResponse] = await Promise.all([
      firstPlay.response,
      concurrentPlay.response,
    ]);
    expect(firstResponse.status).toBe(206);
    expect(firstResponse.headers.get("content-range")).toBe("bytes 0-2/10");
    expect(concurrentResponse.status).toBe(206);
    expect(concurrentResponse.headers.get("content-range")).toBe(
      "bytes 3-5/10",
    );

    let cacheFillFinished = false;
    void firstPlay.lifetime.then(() => {
      cacheFillFinished = true;
    });
    await Promise.resolve();
    expect(cacheFillFinished).toBe(false);

    await vi.waitFor(() => {
      const requests = fetchMock.mock.calls.map(([input]) =>
        input instanceof Request
          ? input
          : new Request(new URL(String(input), origin)),
      );
      expect(requests.filter((request) => request.headers.has("range"))).toHaveLength(
        2,
      );
      expect(
        requests.filter((request) => !request.headers.has("range")),
      ).toHaveLength(1);
    });
    const fullFetchCall = fetchMock.mock.calls.find(([input]) => {
      const request =
        input instanceof Request
          ? input
          : new Request(new URL(String(input), origin));
      return !request.headers.has("range");
    });
    expect(fullFetchCall?.[1]).toEqual(
      expect.objectContaining({ cache: "reload" }),
    );

    resolveFullFetch?.(
      new Response(fullBody, {
        status: 200,
        headers: { "content-type": "video/mp4", etag: '"approved"' },
      }),
    );
    await Promise.all([firstPlay.lifetime, concurrentPlay.lifetime]);
    expect(put).toHaveBeenCalledTimes(1);

    offline = true;
    const networkCallsBeforeReplay = fetchMock.mock.calls.length;
    const offlineReplay = dispatchFetchEvent(
      listeners,
      new Request(videoUrl, { headers: { range: "bytes=6-8" } }),
    );
    const replayResponse = await offlineReplay.response;
    await offlineReplay.lifetime;

    expect(replayResponse.status).toBe(206);
    expect(replayResponse.headers.get("content-range")).toBe("bytes 6-8/10");
    expect(Array.from(new Uint8Array(await replayResponse.arrayBuffer()))).toEqual(
      [6, 7, 8],
    );
    expect(fetchMock).toHaveBeenCalledTimes(networkCallsBeforeReplay);
  });

  it("bounds background optional-media warming without delaying core install", async () => {
    vi.useFakeTimers();
    try {
      const cache = createCacheDouble();
      const cacheStorage = createCacheStorageDouble(cache);
      const aborted: string[] = [];
      const fetchImplementation = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              aborted.push(String(input));
              reject(new Error("optional fetch timed out"));
            });
          }),
      ) as unknown as typeof fetch;
      const { internals } = loadServiceWorker(
        fetchImplementation,
        cacheStorage,
      );

      const warm = internals.precacheOptionalMedia();
      await vi.advanceTimersByTimeAsync(
        internals.OPTIONAL_MEDIA_CACHE_TIMEOUT_MS,
      );

      await expect(warm).resolves.toBeUndefined();
      expect(internals.OPTIONAL_MEDIA_CACHE_TIMEOUT_MS).toBe(10_000);
      expect(aborted).toHaveLength(internals.OPTIONAL_GREETING_WARMUP.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("serves an offline byte range from the cached full MP4", async () => {
    const fullBody = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const match = vi.fn(async (request: Request | string) => {
      expect(request).toBeInstanceOf(Request);
      expect((request as Request).headers.has("range")).toBe(false);
      return new Response(fullBody, {
        status: 200,
        headers: { "content-type": "video/mp4", etag: '"approved"' },
      });
    });
    const cache = createCacheDouble({ match });
    const globalMatch = vi.fn(async () => {
      throw new Error("media must not be read from another cache");
    });
    const cacheStorage = createCacheStorageDouble(cache, {
      match: globalMatch,
    });
    const fetchImplementation = vi.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    const { internals } = loadServiceWorker(
      fetchImplementation,
      cacheStorage,
    );
    const request = new Request(
      "https://morrowward.test/morrowward-marcus-welcome.mp4",
      { headers: { range: "bytes=3-6" } },
    );

    const response = await internals.handleMediaRequest(request);

    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toBe("bytes 3-6/10");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("etag")).toBe('"approved"');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      3, 4, 5, 6,
    ]);
    expect(globalMatch).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("supports open-ended and suffix ranges and rejects invalid ranges", async () => {
    const cache = createCacheDouble();
    const cacheStorage = createCacheStorageDouble(cache);
    const fetchImplementation = vi.fn(async () =>
      new Response("unused"),
    ) as unknown as typeof fetch;
    const { internals } = loadServiceWorker(
      fetchImplementation,
      cacheStorage,
    );

    expect(internals.parseSingleByteRange("bytes=7-", 10)).toEqual({
      start: 7,
      end: 9,
    });
    expect(internals.parseSingleByteRange("bytes=-4", 10)).toEqual({
      start: 6,
      end: 9,
    });
    expect(internals.parseSingleByteRange("bytes=10-11", 10)).toBeNull();
    expect(internals.parseSingleByteRange("bytes=1-2,4-5", 10)).toBeNull();

    const response = await internals.createByteRangeResponse(
      new Response(Uint8Array.from([0, 1, 2, 3]), {
        headers: { "content-type": "video/mp4" },
      }),
      "bytes=9-",
    );
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */4");
  });

  it("returns valid network responses even when runtime cache writes fail", async () => {
    const put = vi.fn(async () => {
      throw new Error("quota exceeded");
    });
    const cache = createCacheDouble({ put });
    const cacheStorage = createCacheStorageDouble(cache);
    const fetchImplementation = vi.fn(async () =>
      new Response("fresh network document", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ) as unknown as typeof fetch;
    const { internals } = loadServiceWorker(
      fetchImplementation,
      cacheStorage,
    );

    const response = await internals.handleNetworkFirstRequest(
      new Request("https://morrowward.test/education"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fresh network document");
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("synthesizes a network byte range from a full 200 response despite cache failure", async () => {
    const put = vi.fn(async () => {
      throw new Error("cache unavailable");
    });
    const cache = createCacheDouble({ put });
    const cacheStorage = createCacheStorageDouble(cache);
    const fetchImplementation = vi.fn(async () =>
      new Response(Uint8Array.from([0, 1, 2, 3, 4, 5]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }),
    ) as unknown as typeof fetch;
    const { internals } = loadServiceWorker(
      fetchImplementation,
      cacheStorage,
    );

    const response = await internals.handleMediaRequest(
      new Request(
        "https://morrowward.test/morrowward-marcus-welcome.mp4",
        { headers: { range: "bytes=1-3" } },
      ),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-3/6");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      1, 2, 3,
    ]);
    expect(put).toHaveBeenCalledTimes(1);
  });
});
