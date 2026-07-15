import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: path.startsWith("/api/") ? "application/json" : "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Morrowward application shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Morrowward[^<]*Small steps/i);
  assert.match(html, /name="description"[^>]*financial-future simulator/i);
  assert.match(html, /rel="manifest"[^>]*href="(?:https?:\/\/[^\"]+)?\/manifest\.json"/i);
  assert.match(html, /Morrowward/i);
  assert.match(html, /Looking toward your horizon/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("worker applies the production security policy to rendered responses", async () => {
  const response = await render();
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(
    response.headers.get("permissions-policy"),
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");

  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /worker-src 'self' blob:/);
  assert.doesNotMatch(csp, /https:\/\/api\.openai\.com/);
});

test("ships the local-first PWA and mission assets", async () => {
  const [manifestText, serviceWorkerText] = await Promise.all([
    readFile(new URL("public/manifest.json", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8"),
    access(new URL("public/dave-age-10-commodore-64.jpg", root)),
    access(new URL("public/og.png", root)),
  ]);

  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.name, "Morrowward — Financial Future Simulator");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(Array.isArray(manifest.icons));
  assert.match(serviceWorkerText, /morrowward-shell-v\d+/i);
  assert.match(serviceWorkerText, /\/_next\/static\//);
  assert.match(serviceWorkerText, /\/assets\//);
  assert.match(serviceWorkerText, /\/api\//);

  await assert.rejects(
    access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)),
  );
});

test("health endpoint describes the privacy and degraded-data mode", async () => {
  const response = await render("/api/v1/health");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.ai.model, "gpt-5.6");
  assert.equal(body.quotes.mode, "sample");
  assert.equal(body.quotes.configured, false);
  assert.equal(body.quotes.fallbackAvailable, true);
  assert.match(body.privacy, /local-first/i);
});
