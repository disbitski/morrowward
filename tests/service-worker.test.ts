import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const serviceWorkerSource = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
const publicationBytes = readFileSync(
  new URL(
    "../public/morrowward-marcus-welcome.publication.json",
    import.meta.url,
  ),
);
const publicationRecord = JSON.parse(publicationBytes.toString("utf8")) as {
  assets: Array<{ sha256: string }>;
};
const publicationSha256 = createHash("sha256")
  .update(publicationBytes)
  .digest("hex");

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
  CORE_APP_SHELL: string[];
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
      `CORE_APP_SHELL, OPTIONAL_GREETING_MEDIA, MEDIA_CACHE, OPTIONAL_MEDIA_CACHE_TIMEOUT_MS, ` +
      `precacheShell, precacheOptionalMedia, ` +
      `canCacheResponse, parseSingleByteRange, createByteRangeResponse, ` +
      `handleMediaRequest, handleNetworkFirstRequest };`,
    sandbox,
    { filename: "public/sw.js" },
  );

  return {
    internals: sandbox.__morrowwardTest as ServiceWorkerInternals,
    listeners,
    workerSelf,
  };
}

describe("Morrowward service worker", () => {
  it("installs the core shell even when every optional greeting file fails", async () => {
    const add = vi.fn(async () => undefined);
    const cache = createCacheDouble({ add });
    const cacheStorage = createCacheStorageDouble(cache);
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("morrowward-marcus-welcome")) {
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
    for (const path of internals.OPTIONAL_GREETING_MEDIA) {
      expect(fetchImplementation).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ cache: "reload" }),
      );
    }
    expect(cacheStorage.open).toHaveBeenCalledWith(internals.MEDIA_CACHE);
    expect(internals.MEDIA_CACHE).toContain("2026-07-15-r1");
    expect(internals.MEDIA_CACHE).toContain(publicationSha256.slice(0, 8));
    for (const asset of publicationRecord.assets) {
      expect(internals.MEDIA_CACHE).toContain(asset.sha256.slice(0, 8));
    }
    expect(add).toHaveBeenCalledWith("/_next/static/app.css");
    expect(add).toHaveBeenCalledWith("/assets/app.js");
  });

  it("returns a successful network 206 untouched and never tries to cache it", async () => {
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
      expect(aborted).toHaveLength(internals.OPTIONAL_GREETING_MEDIA.length);
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
