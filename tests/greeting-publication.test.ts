import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";

const publicRoot = new URL("../public/", import.meta.url);
const publicationUrl = new URL(
  "morrowward-marcus-welcome.publication.json",
  publicRoot,
);
const applicationPublicationUrl = new URL(
  "../app/data/morrowward-marcus-welcome.publication.json",
  import.meta.url,
);

type PublishedAsset = {
  role: "video" | "captions" | "poster";
  filename: string;
  publicPath: string;
  mediaType: string;
  language?: string;
  width?: number;
  height?: number;
  bytes: number;
  sha256: string;
};

type PublicationManifest = {
  schemaVersion: number;
  assetId: string;
  revision: string;
  status: string;
  assets: PublishedAsset[];
  content: {
    transcript: string;
    directQuote: string;
    attribution: string;
    source: { publisher: string; url: string; usage: string };
  };
  disclosures: {
    interpretation: string;
    voice: string;
    playback: string;
  };
  generation: {
    provider: string;
    image: { model: string; resolution: string; aspectRatio: string };
    video: {
      model: string;
      workflow: string;
      durationSeconds: number;
      resolution: string;
      aspectRatio: string;
    };
    narration: {
      service: string;
      voiceId: string;
      voiceType: string;
      language: string;
    };
  };
  approval: {
    status: string;
    approvedBy: string;
    approvedAt: string;
    basis: string[];
  };
};

async function loadPublication() {
  const raw = await readFile(publicationUrl, "utf8");
  return { raw, manifest: JSON.parse(raw) as PublicationManifest };
}

async function sha256(url: URL) {
  return createHash("sha256").update(await readFile(url)).digest("hex");
}

function timestampToSeconds(timestamp: string) {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/u.exec(timestamp);
  if (!match) throw new Error(`Invalid WebVTT timestamp: ${timestamp}`);
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

function expectExactKeys(
  value: object,
  keys: string[],
) {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

describe("approved Marcus greeting publication", () => {
  it("keeps application metadata byte-for-byte aligned with the public record", async () => {
    expect(await readFile(applicationPublicationUrl)).toEqual(
      await readFile(publicationUrl),
    );
  });

  it("binds each canonical public file to its exact bytes and SHA-256 digest", async () => {
    const { manifest } = await loadPublication();
    const expectedAssets: PublishedAsset[] = [
      {
        role: "video",
        filename: "morrowward-marcus-welcome.mp4",
        publicPath: "/morrowward-marcus-welcome.mp4",
        mediaType: "video/mp4",
        bytes: 4_104_160,
        sha256:
          "4a254a2983237eec3bffa97d601413884924c8ff42b585aad6f2560a1a627728",
      },
      {
        role: "captions",
        filename: "morrowward-marcus-welcome.en.vtt",
        publicPath: "/morrowward-marcus-welcome.en.vtt",
        mediaType: "text/vtt; charset=utf-8",
        language: "en",
        bytes: 295,
        sha256:
          "b2e5b45dd0c8584bab44ad281bb78223ff5ec04387a72c48deb6b897f8be97a3",
      },
      {
        role: "poster",
        filename: "morrowward-marcus-welcome-poster.jpg",
        publicPath: "/morrowward-marcus-welcome-poster.jpg",
        mediaType: "image/jpeg",
        width: 1280,
        height: 720,
        bytes: 83_611,
        sha256:
          "1d980a1fd25d3bc199dea81778b367ddab905a6e3c12748d1e9bc4b3cc527764",
      },
    ];

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.assetId).toBe("morrowward-marcus-welcome");
    expect(manifest.revision).toBe("2026-07-15-r1");
    expect(manifest.status).toBe("approved");
    expect(manifest.assets).toEqual(expectedAssets);

    for (const asset of manifest.assets) {
      expect(asset.publicPath).toBe(`/${asset.filename}`);
      expect(basename(asset.publicPath)).toBe(asset.filename);
      const assetUrl = new URL(asset.filename, publicRoot);
      expect((await stat(assetUrl)).size).toBe(asset.bytes);
      expect(await sha256(assetUrl)).toBe(asset.sha256);
    }
  });

  it("publishes the exact transcript, source, disclosures, models, and approval basis", async () => {
    const { manifest } = await loadPublication();
    expect(manifest.content).toEqual({
      transcript:
        "Thanks for using Morrowward. Dave asked for a little encouragement. Marcus Aurelius wrote, “I am rising to the work of a human being.” Small steps begin today.",
      directQuote: "I am rising to the work of a human being.",
      attribution:
        "Marcus Aurelius, Meditations, Book V, section 1; George Long translation (1862)",
      source: {
        publisher: "Project Gutenberg",
        url: "https://www.gutenberg.org/files/6920/6920-h/6920-h.htm",
        usage:
          "The narration attributes and uses this short public-domain quotation; all surrounding words are original Morrowward copy.",
      },
    });
    expect(manifest.disclosures).toEqual({
      interpretation:
        "AI-generated historical interpretation of Marcus Aurelius. This is not an authentic likeness, archival recording, or endorsement.",
      voice:
        "AI-generated narration using an xAI built-in voice. It is not Marcus Aurelius’s voice and does not imitate a historical recording.",
      playback:
        "Optional media with user-initiated playback, English captions, a transcript, and a reduced-motion poster experience.",
    });
    expect(manifest.generation).toEqual({
      provider: "xAI",
      image: {
        model: "grok-imagine-image-quality",
        resolution: "2k",
        aspectRatio: "16:9",
      },
      video: {
        model: "grok-imagine-video-1.5",
        workflow: "image-to-video",
        durationSeconds: 15,
        resolution: "720p",
        aspectRatio: "16:9",
      },
      narration: {
        service: "xAI Text to Speech",
        voiceId: "sal",
        voiceType: "built-in",
        language: "en",
      },
    });
    expect(manifest.approval).toEqual({
      status: "approved",
      approvedBy: "Dave Isbitski",
      approvedAt: "2026-07-15T19:52:58Z",
      basis: [
        "Codex/GPT original-resolution and frame-sequence review passed every hard gate and scored 29 of 30.",
        "Human final review of the composed 15-second greeting: “Looks great bro!”",
      ],
    });
  });

  it("keeps the public record sanitized and the captions faithful to the transcript", async () => {
    const { raw, manifest } = await loadPublication();
    expect(raw).not.toMatch(
      /(?:\/Users\/|\.media-review|request[_-]?id|response[_-]?id|generation[_-]?id)/iu,
    );
    expectExactKeys(manifest, [
      "schemaVersion",
      "assetId",
      "revision",
      "status",
      "assets",
      "content",
      "disclosures",
      "generation",
      "approval",
    ]);
    expectExactKeys(manifest.assets[0], [
      "role",
      "filename",
      "publicPath",
      "mediaType",
      "bytes",
      "sha256",
    ]);
    expectExactKeys(manifest.assets[1], [
      "role",
      "filename",
      "publicPath",
      "mediaType",
      "language",
      "bytes",
      "sha256",
    ]);
    expectExactKeys(manifest.assets[2], [
      "role",
      "filename",
      "publicPath",
      "mediaType",
      "width",
      "height",
      "bytes",
      "sha256",
    ]);
    expectExactKeys(manifest.content, [
      "transcript",
      "directQuote",
      "attribution",
      "source",
    ]);
    expectExactKeys(manifest.content.source, ["publisher", "url", "usage"]);
    expectExactKeys(manifest.disclosures, [
      "interpretation",
      "voice",
      "playback",
    ]);
    expectExactKeys(manifest.generation, [
      "provider",
      "image",
      "video",
      "narration",
    ]);
    expectExactKeys(manifest.generation.image, [
      "model",
      "resolution",
      "aspectRatio",
    ]);
    expectExactKeys(manifest.generation.video, [
      "model",
      "workflow",
      "durationSeconds",
      "resolution",
      "aspectRatio",
    ]);
    expectExactKeys(manifest.generation.narration, [
      "service",
      "voiceId",
      "voiceType",
      "language",
    ]);
    expectExactKeys(manifest.approval, [
      "status",
      "approvedBy",
      "approvedAt",
      "basis",
    ]);
    expect(manifest.content.transcript).toContain(manifest.content.directQuote);
    expect(manifest.content.source.url).toMatch(/^https:\/\/www\.gutenberg\.org\//u);
    expect(manifest.disclosures.interpretation).toMatch(/AI-generated/u);
    expect(manifest.disclosures.voice).toMatch(/not Marcus Aurelius’s voice/u);

    const captions = await readFile(
      new URL("morrowward-marcus-welcome.en.vtt", publicRoot),
      "utf8",
    );
    expect(captions.startsWith("WEBVTT\n")).toBe(true);
    const cueBlocks = captions.trim().split(/\n{2,}/u).slice(1);
    let previousEnd = 0;
    const spokenText: string[] = [];

    for (const block of cueBlocks) {
      const [timing, ...textLines] = block.split("\n");
      const timingMatch =
        /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})$/u.exec(
          timing,
        );
      expect(timingMatch).not.toBeNull();
      const start = timestampToSeconds(timingMatch?.[1] ?? "");
      const end = timestampToSeconds(timingMatch?.[2] ?? "");
      expect(start).toBeGreaterThanOrEqual(previousEnd);
      expect(end).toBeGreaterThan(start);
      expect(end).toBeLessThanOrEqual(15);
      previousEnd = end;
      spokenText.push(textLines.join(" "));
    }

    expect(spokenText.join(" ")).toBe(manifest.content.transcript);
  });
});
