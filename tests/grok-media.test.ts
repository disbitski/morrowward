import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  MEDIA_REVIEW_ROOT,
  XAI_API_BASE_URL,
  assertReviewedCandidateUpload,
  buildImageGenerationRequest,
  buildTtsRequest,
  buildVideoGenerationRequest,
  createWebVttFromCharacterTimings,
  decodeImageGenerationResponse,
  decodeTtsResponse,
  detectMediaMimeType,
  downloadAndValidateMedia,
  loadCampaignManifest,
  pollVideoGeneration,
  readImageDimensions,
  requestJson,
  resolveMediaReviewPath,
  requireXaiApiKey,
  requireXaiUploadConfirmation,
  sha256Hex,
  validateMediaBuffer,
} from "../scripts/grok/media-lib.mjs";

function fakePng(width = 2048, height = 1152): Buffer {
  const buffer = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(
    buffer,
  );
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function fakeWav(): Buffer {
  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.write("data", 36, "ascii");
  return buffer;
}

function fakeMp4(): Buffer {
  const buffer = Buffer.alloc(128);
  buffer.writeUInt32BE(24, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("isom", 8, "ascii");
  return buffer;
}

describe("fresh Grok media helpers", () => {
  it("loads the campaign and enforces four private 2K candidates", async () => {
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );

    expect(manifest.campaignId).toBe("morrowward-marcus-greeting");
    expect(manifest.image.candidateCount).toBe(4);
    expect(manifest.image.resolution).toBe("2k");
    expect(manifest.image.responseFormat).toBe("b64_json");
    expect(manifest.playback.autoplay).toBe(false);
    expect(manifest.narration.voiceType).toBe("built-in");
    expect(prompts.narration).toBe(manifest.metadata.transcript);
  });

  it("builds current official image, video, and timestamped TTS requests", async () => {
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );
    expect(buildImageGenerationRequest(manifest, prompts.image)).toMatchObject({
      model: "grok-imagine-image-quality",
      n: 4,
      aspect_ratio: "16:9",
      resolution: "2k",
      response_format: "b64_json",
    });
    expect(
      buildVideoGenerationRequest(
        manifest,
        "imageToVideo",
        prompts.imageToVideo,
        "data:image/png;base64,AAAA",
      ),
    ).toMatchObject({
      model: "grok-imagine-video-1.5",
      duration: 12,
      aspect_ratio: "16:9",
      resolution: "720p",
      image: { url: "data:image/png;base64,AAAA" },
    });
    expect(buildTtsRequest(manifest, prompts.narration)).toMatchObject({
      voice_id: "sal",
      language: "en",
      output_format: { codec: "wav", sample_rate: 44_100 },
      with_timestamps: true,
    });
  });

  it("requires the key only from the environment", () => {
    expect(requireXaiApiKey({ XAI_API_KEY: " xai-test " })).toBe("xai-test");
    expect(() => requireXaiApiKey({})).toThrow(/process environment/);
    expect(() => requireXaiApiKey({ XAI_API_KEY: "  " })).toThrow(
      /process environment/,
    );
  });

  it("requires explicit acknowledgement before any private media upload", () => {
    expect(() =>
      requireXaiUploadConfirmation({}, "the private prompt"),
    ).toThrow(/--confirm-xai-upload/);
    expect(() =>
      requireXaiUploadConfirmation(
        { "confirm-xai-upload": "yes" },
        "the private prompt",
      ),
    ).toThrow(/--confirm-xai-upload/);
    expect(() =>
      requireXaiUploadConfirmation(
        { "confirm-xai-upload": true },
        "the private prompt",
      ),
    ).not.toThrow();
  });

  it("keeps every custom raw-media path inside the ignored review root", async () => {
    const safePath = resolve(MEDIA_REVIEW_ROOT, "grok", "private-run");
    await expect(resolveMediaReviewPath(safePath)).resolves.toBe(safePath);
    await expect(
      resolveMediaReviewPath(resolve(MEDIA_REVIEW_ROOT, "..", "public")),
    ).rejects.toThrow(/must stay inside/);
  });

  it("rejects existing symbolic-link components below the review root", async () => {
    await mkdir(MEDIA_REVIEW_ROOT, { recursive: true });
    const testDirectory = await mkdtemp(resolve(MEDIA_REVIEW_ROOT, "path-test-"));
    try {
      const linkPath = resolve(testDirectory, "escape");
      await symlink("/private/tmp", linkPath);
      await expect(
        resolveMediaReviewPath(resolve(linkPath, "raw-video.mp4")),
      ).rejects.toThrow(/cannot contain symbolic links/);
    } finally {
      await rm(testDirectory, { recursive: true, force: true });
    }
  });

  it("permits image-to-video only for the selected, reviewed, hash-matched candidate", () => {
    const runDirectory = resolve(
      MEDIA_REVIEW_ROOT,
      "grok",
      "morrowward-marcus-greeting",
      "test-run",
    );
    const imagePath = resolve(runDirectory, "images", "image-candidate-01.png");
    const sha256 = sha256Hex(fakePng());
    const reviewManifest = {
      selection: { selectedCandidateId: "image-1" },
      candidates: [
        {
          id: "image-1",
          filename: "images/image-candidate-01.png",
          sha256,
          review: { hardGatesPassed: true },
        },
      ],
    };

    expect(
      assertReviewedCandidateUpload(
        reviewManifest,
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toMatchObject({ id: "image-1" });

    expect(() =>
      assertReviewedCandidateUpload(
        { ...reviewManifest, selection: { selectedCandidateId: "image-2" } },
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toThrow(/match exactly one candidate/);
    expect(() =>
      assertReviewedCandidateUpload(
        {
          ...reviewManifest,
          candidates: [
            {
              ...reviewManifest.candidates[0],
              review: { hardGatesPassed: false },
            },
          ],
        },
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toThrow(/pass every hard gate/);
    expect(() =>
      assertReviewedCandidateUpload(
        reviewManifest,
        runDirectory,
        resolve(runDirectory, "images", "image-candidate-02.png"),
        sha256,
      ),
    ).toThrow(/exact candidate selected/);
    expect(() =>
      assertReviewedCandidateUpload(
        reviewManifest,
        runDirectory,
        imagePath,
        "0".repeat(64),
      ),
    ).toThrow(/SHA-256/);
    expect(() =>
      assertReviewedCandidateUpload(
        {
          ...reviewManifest,
          candidates: [
            {
              ...reviewManifest.candidates[0],
              filename: "../childhood-photo.jpeg",
            },
          ],
        },
        runDirectory,
        resolve(runDirectory, "..", "childhood-photo.jpeg"),
        sha256,
      ),
    ).toThrow(/images directory/);
  });

  it("preserves provider MIME and rejects mismatched or non-media bytes", () => {
    const png = fakePng();
    expect(detectMediaMimeType(png)).toBe("image/png");
    expect(validateMediaBuffer(png, "image/png", { kind: "image" })).toBe(
      "image/png",
    );
    expect(readImageDimensions(png)).toEqual({ width: 2048, height: 1152 });
    expect(() =>
      validateMediaBuffer(png, "image/jpeg", { kind: "image" }),
    ).toThrow(/MIME mismatch/);
    expect(() =>
      validateMediaBuffer(Buffer.from("<html>error</html>"), "text/html"),
    ).toThrow(/supported image or video format/);
  });

  it("decodes all image candidates and fails closed on count or base64 errors", () => {
    const encoded = fakePng().toString("base64");
    const decoded = decodeImageGenerationResponse(
      {
        data: Array.from({ length: 4 }, () => ({
          b64_json: encoded,
          mime_type: "image/png",
        })),
      },
      4,
    );
    expect(decoded).toHaveLength(4);
    expect(decoded.every((candidate: { mimeType: string }) => candidate.mimeType === "image/png")).toBe(
      true,
    );
    expect(() =>
      decodeImageGenerationResponse({ data: [{ b64_json: encoded }] }, 4),
    ).toThrow(/expected 4/);
    expect(() =>
      decodeImageGenerationResponse(
        { data: Array.from({ length: 4 }, () => ({ b64_json: "%%%" })) },
        4,
      ),
    ).toThrow(/invalid base64/);
  });

  it("sends bearer authorization without including it in request errors", async () => {
    const fetchMock = vi.fn(
      async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        expect(init).toBeDefined();
        if (!init) throw new Error("Expected request init options.");
        expect(init.headers).toMatchObject({
          Authorization: "Bearer xai-secret-test",
          "Content-Type": "application/json",
        });
        return new Response(
          JSON.stringify({ message: "bad xai-secret-test" }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await expect(
      requestJson(fetchMock, `${XAI_API_BASE_URL}/images/generations`, {
        apiKey: "xai-secret-test",
        method: "POST",
        body: { prompt: "test" },
      }),
    ).rejects.not.toThrow(/xai-secret-test/);
  });

  it("polls pending video jobs and accepts the documented completed shape", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "pending" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "done",
            video: {
              url: "https://vidgen.x.ai/example.mp4",
              duration: 10,
              respect_moderation: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    let clock = 0;
    const result = await pollVideoGeneration(fetchMock, "xai-test", "request 1", {
      intervalMs: 5,
      timeoutMs: 100,
      sleep,
      now: () => {
        clock += 1;
        return clock;
      },
    });

    expect(result.video.url).toBe("https://vidgen.x.ai/example.mp4");
    expect(fetchMock.mock.calls[0][0]).toContain("request%201");
    expect(sleep).toHaveBeenCalledWith(5);
  });

  it("downloads over HTTPS and validates video MIME against magic bytes", async () => {
    const mp4 = fakeMp4();
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array(mp4), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }),
    );
    const result = await downloadAndValidateMedia(
      fetchMock,
      "https://vidgen.x.ai/example.mp4",
      { kind: "video", minimumBytes: 100 },
    );

    expect(result.mimeType).toBe("video/mp4");
    expect(result.buffer).toEqual(mp4);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      downloadAndValidateMedia(fetchMock, "http://example.com/video.mp4", {
        kind: "video",
      }),
    ).rejects.toThrow(/HTTPS/);
  });

  it("validates timestamped built-in narration and creates WebVTT captions", () => {
    const text = "Welcome. Small steps.";
    const characters = [...text];
    const times = characters.map((_, index) => [index * 0.05, (index + 1) * 0.05]);
    const decoded = decodeTtsResponse(
      {
        audio: fakeWav().toString("base64"),
        content_type: "audio/wav",
        duration: times.at(-1)?.[1],
        audio_timestamps: { graph_chars: characters, graph_times: times },
      },
      text,
    );
    const captions = createWebVttFromCharacterTimings(
      text,
      decoded.characters,
      decoded.times,
    );

    expect(decoded.mimeType).toBe("audio/wav");
    expect(captions).toContain("WEBVTT");
    expect(captions).toContain("Welcome.");
    expect(captions).toContain("Small steps.");
    expect(captions).toContain("-->");
  });

  it("rejects overlapping or out-of-duration TTS character timings", () => {
    const text = "Go";
    const basePayload = {
      audio: fakeWav().toString("base64"),
      content_type: "audio/wav",
      duration: 0.5,
      audio_timestamps: {
        graph_chars: [...text],
        graph_times: [
          [0, 0.3],
          [0.3, 0.5],
        ],
      },
    };

    expect(() =>
      decodeTtsResponse(
        {
          ...basePayload,
          audio_timestamps: {
            ...basePayload.audio_timestamps,
            graph_times: [
              [0, 0.3],
              [0.2, 0.5],
            ],
          },
        },
        text,
      ),
    ).toThrow(/monotonic.*overlap/);
    expect(() =>
      decodeTtsResponse(
        {
          ...basePayload,
          audio_timestamps: {
            ...basePayload.audio_timestamps,
            graph_times: [
              [0, 0.3],
              [0.3, 0.51],
            ],
          },
        },
        text,
      ),
    ).toThrow(/declared duration/);
  });
});
