import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_XAI_JSON_TIMEOUT_MS,
  MEDIA_REVIEW_ROOT,
  XAI_API_BASE_URL,
  assertImageMatchesRequest,
  assertNarrationFitsVisual,
  assertReviewPolicyMatchesCampaign,
  assertReviewedCandidateUpload,
  assertVideoMatchesRequest,
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
  parseFfprobeMedia,
  readImageDimensions,
  requestJson,
  resolveMediaReviewPath,
  requireXaiApiKey,
  requireXaiUploadConfirmation,
  sha256Hex,
  validateCampaignManifest,
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

function validReviewPolicy() {
  return {
    humanFinalApprovalRequired: true,
    minimumScore: 9,
    minimumDimensionScore: 4,
    hardGates: ["No malformed anatomy.", "No financial promises."],
    scorecard: [
      { id: "craft", label: "Visual craft", maximum: 5 },
      { id: "accessibility", label: "Accessibility", maximum: 5 },
    ],
  };
}

function validReviewedCandidateManifest(runDirectory: string) {
  const imagePath = resolve(runDirectory, "images", "image-candidate-01.png");
  const sha256 = sha256Hex(fakePng());
  return {
    imagePath,
    sha256,
    reviewManifest: {
      transcript:
        "Marcus Aurelius wrote, “I am rising to the work of a human being.”",
      directQuote: "I am rising to the work of a human being.",
      directQuoteAttribution:
        "Quote: Meditations 5.1 · George Long translation · View source",
      source: {
        author: "Marcus Aurelius",
        work: "Meditations",
        location: "Book V, section 1",
        translator: "George Long",
        translationYear: 1862,
        publicDomainExactText:
          "I am rising to the work of a human being.",
        usage: "The narration uses this short direct quotation.",
        url: "https://www.gutenberg.org/files/6920/6920-h/6920-h.htm",
      },
      reviewPolicy: validReviewPolicy(),
      selection: { selectedCandidateId: "image-1" },
      candidates: [
        {
          id: "image-1",
          filename: "images/image-candidate-01.png",
          sha256,
          review: {
            hardGatesPassed: true,
            scores: { craft: 5, accessibility: 4 },
            totalScore: 9,
          },
        },
      ],
    },
  };
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

  it("binds run review policy to the exact campaign policy", () => {
    const campaignPolicy = validReviewPolicy();
    expect(
      assertReviewPolicyMatchesCampaign(
        structuredClone(campaignPolicy),
        campaignPolicy,
      ),
    ).toEqual(campaignPolicy);

    const changedLabel = structuredClone(campaignPolicy);
    changedLabel.scorecard[0].label = "Easier visual craft";
    expect(() =>
      assertReviewPolicyMatchesCampaign(changedLabel, campaignPolicy),
    ).toThrow(/exactly match/);

    const changedThreshold = structuredClone(campaignPolicy);
    changedThreshold.minimumScore = 8;
    expect(() =>
      assertReviewPolicyMatchesCampaign(changedThreshold, campaignPolicy),
    ).toThrow(/exactly match/);

    const removedGate = structuredClone(campaignPolicy);
    removedGate.hardGates = removedGate.hardGates.slice(1);
    expect(() =>
      assertReviewPolicyMatchesCampaign(removedGate, campaignPolicy),
    ).toThrow(/exactly match/);
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
      duration: 15,
      aspect_ratio: "16:9",
      resolution: "720p",
      image: { url: "data:image/png;base64,AAAA" },
    });
    expect(
      buildVideoGenerationRequest(
        manifest,
        "textToVideo",
        prompts.textToVideo,
      ),
    ).toMatchObject({
      model: "grok-imagine-video",
      duration: 15,
      aspect_ratio: "16:9",
      resolution: "720p",
    });
    expect(buildTtsRequest(manifest, prompts.narration)).toMatchObject({
      voice_id: "sal",
      language: "en",
      output_format: { codec: "wav", sample_rate: 44_100 },
      with_timestamps: true,
    });
  });

  it("fails pre-spend validation if video output exceeds the 720p contract", async () => {
    const { manifest } = await loadCampaignManifest(DEFAULT_MANIFEST_PATH);
    const invalid = structuredClone(manifest);
    invalid.video.imageToVideo.resolution = "1080p";

    expect(() => validateCampaignManifest(invalid)).toThrow(
      /imageToVideo\.resolution must be 720p/,
    );
  });

  it("locks image requests and decoded output to the 2K 16:9 contract", async () => {
    const { manifest } = await loadCampaignManifest(DEFAULT_MANIFEST_PATH);
    expect(
      assertImageMatchesRequest(
        { width: 2048, height: 1152 },
        manifest.image,
      ),
    ).toEqual({ width: 2048, height: 1152 });
    expect(
      assertImageMatchesRequest(
        { width: 2816, height: 1584 },
        manifest.image,
      ),
    ).toEqual({ width: 2816, height: 1584 });
    expect(() =>
      assertImageMatchesRequest(
        { width: 2048, height: 2048 },
        manifest.image,
      ),
    ).toThrow(/expected 16:9 output/);
    expect(() =>
      assertImageMatchesRequest(
        { width: 1024, height: 576 },
        manifest.image,
      ),
    ).toThrow(/expected at least 2048x1152/);

    const wrongAspect = structuredClone(manifest);
    wrongAspect.image.aspectRatio = "1:1";
    expect(() => validateCampaignManifest(wrongAspect)).toThrow(
      /must request 16:9 output/,
    );
    const weakMinimum = structuredClone(manifest);
    weakMinimum.image.minimumEdgePixels = 999;
    expect(() => validateCampaignManifest(weakMinimum)).toThrow(
      /minimumEdgePixels must be an integer from 1000/,
    );
  });

  it("validates review thresholds before any generation spend", async () => {
    const { manifest } = await loadCampaignManifest(DEFAULT_MANIFEST_PATH);
    const tooLowPerDimension = structuredClone(manifest);
    tooLowPerDimension.review.minimumDimensionScore = 6;
    expect(() => validateCampaignManifest(tooLowPerDimension)).toThrow(
      /minimumDimensionScore.*no greater than every dimension maximum/,
    );

    const impossibleTotal = structuredClone(manifest);
    impossibleTotal.review.minimumScore = 31;
    expect(() => validateCampaignManifest(impossibleTotal)).toThrow(
      /minimumScore must be an integer from 24 to 30/,
    );
    const ineffectiveTotal = structuredClone(manifest);
    ineffectiveTotal.review.minimumScore = 23;
    expect(() => validateCampaignManifest(ineffectiveTotal)).toThrow(
      /minimumScore must be an integer from 24 to 30/,
    );
  });

  it("keeps the direct quote, public-domain source, and transcript exact", async () => {
    const { manifest } = await loadCampaignManifest(DEFAULT_MANIFEST_PATH);
    const changedQuote = structuredClone(manifest);
    changedQuote.metadata.directQuote = "I am rising to human work.";
    expect(() => validateCampaignManifest(changedQuote)).toThrow(
      /directQuote must exactly match source\.publicDomainExactText/,
    );

    const missingFromTranscript = structuredClone(manifest);
    missingFromTranscript.metadata.transcript = "Small steps begin today.";
    expect(() => validateCampaignManifest(missingFromTranscript)).toThrow(
      /transcript must include the exact direct quote/,
    );
    const insecureSource = structuredClone(manifest);
    insecureSource.metadata.source.url = "http://example.com/quote";
    expect(() => validateCampaignManifest(insecureSource)).toThrow(
      /source\.url must be a valid HTTPS URL/,
    );
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
    const { imagePath, sha256, reviewManifest } =
      validReviewedCandidateManifest(runDirectory);

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

  it("rejects incomplete, out-of-bounds, sub-threshold, or false review totals", () => {
    const runDirectory = resolve(MEDIA_REVIEW_ROOT, "grok", "scored-run");
    const { imagePath, sha256, reviewManifest } =
      validReviewedCandidateManifest(runDirectory);
    const withReview = (review: Record<string, unknown>) => ({
      ...reviewManifest,
      candidates: [
        {
          ...reviewManifest.candidates[0],
          review: {
            ...reviewManifest.candidates[0].review,
            ...review,
          },
        },
      ],
    });

    expect(() =>
      assertReviewedCandidateUpload(
        withReview({ scores: { craft: 5 }, totalScore: 5 }),
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toThrow(/exactly match.*missing: accessibility/);
    expect(() =>
      assertReviewedCandidateUpload(
        withReview({
          scores: { craft: 6, accessibility: 4 },
          totalScore: 10,
        }),
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toThrow(/craft must be an integer from 1 to 5/);
    expect(() =>
      assertReviewedCandidateUpload(
        withReview({
          scores: { craft: 5, accessibility: 3 },
          totalScore: 8,
        }),
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toThrow(/accessibility is below minimumDimensionScore 4/);
    expect(() =>
      assertReviewedCandidateUpload(
        withReview({
          scores: { craft: 5, accessibility: 4 },
          totalScore: 10,
        }),
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toThrow(/totalScore must equal.*9/);
    expect(() =>
      assertReviewedCandidateUpload(
        withReview({
          scores: { craft: 4, accessibility: 4 },
          totalScore: 8,
        }),
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toThrow(/total 8 is below minimumScore 9/);
  });

  it("rejects review metadata when the selected quote or transcript drifted", () => {
    const runDirectory = resolve(MEDIA_REVIEW_ROOT, "grok", "quote-drift-run");
    const { imagePath, sha256, reviewManifest } =
      validReviewedCandidateManifest(runDirectory);

    expect(() =>
      assertReviewedCandidateUpload(
        { ...reviewManifest, directQuote: "A changed quotation." },
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toThrow(/directQuote must exactly match source\.publicDomainExactText/);
    expect(() =>
      assertReviewedCandidateUpload(
        { ...reviewManifest, transcript: "Small steps begin today." },
        runDirectory,
        imagePath,
        sha256,
      ),
    ).toThrow(/transcript must include the exact direct quote/);
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

  it("bounds streamed JSON responses and aborts a hung JSON request", async () => {
    const oversizedJson = JSON.stringify({ value: "0123456789" });
    const oversizedFetch = vi.fn(
      async () =>
        new Response(oversizedJson, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      requestJson(oversizedFetch, `${XAI_API_BASE_URL}/oversized`, {
        apiKey: "xai-test",
        maximumBytes: Buffer.byteLength(oversizedJson) - 1,
      }),
    ).rejects.toThrow(/JSON response exceeds/);

    let observedSignal: AbortSignal | undefined;
    const hangingFetch = vi.fn(
      async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        observedSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          observedSignal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );
    await expect(
      requestJson(hangingFetch, `${XAI_API_BASE_URL}/hanging`, {
        apiKey: "xai-test",
        timeoutMs: 5,
      }),
    ).rejects.toThrow(/JSON request timed out after 5ms/);
    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedSignal?.aborted).toBe(true);
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

  it("bounds each video poll request by the remaining overall deadline", async () => {
    const clock = [1_000, 1_040];
    let observedSignal: AbortSignal | undefined;
    const hangingFetch = vi.fn(
      async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        observedSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          observedSignal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );

    await expect(
      pollVideoGeneration(hangingFetch, "xai-test", "bounded", {
        intervalMs: 5,
        timeoutMs: 50,
        now: () => clock.shift() ?? 1_040,
      }),
    ).rejects.toThrow(/JSON request timed out after 10ms/);
    expect(observedSignal?.aborted).toBe(true);
  });

  it("keeps the per-request JSON ceiling during a long video poll window", async () => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | undefined;
      const hangingFetch = vi.fn(
        async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
          observedSignal = init?.signal ?? undefined;
          return new Promise<Response>((_resolve, reject) => {
            observedSignal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        },
      );
      const pollPromise = pollVideoGeneration(
        hangingFetch,
        "xai-test",
        "per-request-cap",
        {
          intervalMs: 5_000,
          timeoutMs: 2 * DEFAULT_XAI_JSON_TIMEOUT_MS,
          now: () => 0,
        },
      );
      const rejection = expect(pollPromise).rejects.toThrow(
        new RegExp(
          `JSON request timed out after ${DEFAULT_XAI_JSON_TIMEOUT_MS}ms`,
        ),
      );

      await vi.advanceTimersByTimeAsync(DEFAULT_XAI_JSON_TIMEOUT_MS);
      await rejection;
      expect(observedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("downloads over HTTPS and validates video MIME against magic bytes", async () => {
    const mp4 = fakeMp4();
    const fetchMock = vi.fn(
      async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        void url;
        void init;
        return new Response(new Uint8Array(mp4), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      },
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
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "follow" });
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("bounds streamed downloads, rejects HTTPS redirect downgrade, and times out", async () => {
    const mp4 = fakeMp4();
    const streamedFetch = vi.fn(
      async () =>
        new Response(new Uint8Array(mp4), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        }),
    );
    await expect(
      downloadAndValidateMedia(
        streamedFetch,
        "https://vidgen.x.ai/oversized.mp4",
        { kind: "video", maximumBytes: mp4.length - 1 },
      ),
    ).rejects.toThrow(/exceeds the 127-byte download limit/);

    const declaredOversizeFetch = vi.fn(
      async () =>
        new Response(new Uint8Array(mp4), {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": String(mp4.length + 1),
          },
        }),
    );
    await expect(
      downloadAndValidateMedia(
        declaredOversizeFetch,
        "https://vidgen.x.ai/declared-oversized.mp4",
        { kind: "video", maximumBytes: mp4.length },
      ),
    ).rejects.toThrow(/exceeds the 128-byte download limit/);

    const downgradedResponse = new Response(new Uint8Array(mp4), {
      status: 200,
      headers: { "content-type": "video/mp4" },
    });
    Object.defineProperty(downgradedResponse, "url", {
      value: "http://cdn.example.com/video.mp4",
    });
    await expect(
      downloadAndValidateMedia(
        vi.fn(async () => downgradedResponse),
        "https://vidgen.x.ai/redirect.mp4",
        { kind: "video" },
      ),
    ).rejects.toThrow(/final redirect URL must continue to use HTTPS/);

    const hangingFetch = vi.fn(
      async (
        url: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ): Promise<Response> => {
        void url;
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );
    await expect(
      downloadAndValidateMedia(
        hangingFetch,
        "https://vidgen.x.ai/hanging.mp4",
        { kind: "video", timeoutMs: 5 },
      ),
    ).rejects.toThrow(/timed out after 5ms/);
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

  it("keeps closing curly and straight quotes with sentence punctuation", () => {
    const text =
      "Thanks for using Morrowward. Dave asked for a little encouragement. Marcus Aurelius wrote, “I am rising to the work of a human being.” Small steps begin today.";
    const characters = [...text];
    const times = characters.map((_, index) => [
      index * 0.05,
      (index + 1) * 0.05,
    ]);
    const captions = createWebVttFromCharacterTimings(
      text,
      characters,
      times,
    );
    const cues = captions.trim().split("\n\n").slice(1);

    expect(cues).toHaveLength(4);
    expect(cues[2]).toContain(
      "Marcus Aurelius wrote, “I am rising to the work of a human being.”",
    );
    expect(cues[3]).toContain("Small steps begin today.");
    expect(captions).not.toContain("\n” Small steps");

    const straightText = 'He wrote, "Begin." Then he did.';
    const straightCharacters = [...straightText];
    const straightTimes = straightCharacters.map((_, index) => [
      index * 0.05,
      (index + 1) * 0.05,
    ]);
    const straightCaptions = createWebVttFromCharacterTimings(
      straightText,
      straightCharacters,
      straightTimes,
    );
    expect(straightCaptions).toContain('\nHe wrote, "Begin."');
    expect(straightCaptions).not.toContain('\n" Then he did.');
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

  it("validates actual 1280x720 video duration from ffprobe metadata", () => {
    const probe = parseFfprobeMedia({
      streams: [
        {
          codec_type: "video",
          width: 1280,
          height: 720,
          duration: "15.033",
        },
        { codec_type: "audio", duration: "15.033" },
      ],
      format: { duration: "15.033" },
    });

    expect(
      assertVideoMatchesRequest(probe, {
        expectedDurationSeconds: 15,
        requireAudio: true,
        label: "Test greeting",
      }),
    ).toBe(probe);
    expect(() =>
      assertVideoMatchesRequest(
        { ...probe, video: { width: 1920, height: 1080 } },
        { expectedDurationSeconds: 15 },
      ),
    ).toThrow(/expected exactly 1280x720/);
    expect(() =>
      assertVideoMatchesRequest(
        { ...probe, durationSeconds: 14.7 },
        { expectedDurationSeconds: 15 },
      ),
    ).toThrow(/within \+\/-0\.25s/);
    expect(() =>
      assertVideoMatchesRequest(
        { ...probe, hasAudio: false },
        { expectedDurationSeconds: 15, requireAudio: true },
      ),
    ).toThrow(/no audio stream/);
  });

  it("rejects narration that would be truncated by the visual", () => {
    const visual = {
      durationSeconds: 15,
      video: { width: 1280, height: 720 },
      hasAudio: false,
    };
    const fittingNarration = {
      durationSeconds: 12.4,
      video: null,
      hasAudio: true,
    };

    const fit = assertNarrationFitsVisual(visual, fittingNarration);
    expect(fit).toMatchObject({
      visualDurationSeconds: 15,
      narrationDurationSeconds: 12.4,
    });
    expect(fit.tailHeadroomSeconds).toBeCloseTo(2.6);
    expect(() =>
      assertNarrationFitsVisual(visual, {
        ...fittingNarration,
        durationSeconds: 14.98,
      }),
    ).toThrow(/must fit.*tail headroom/);
    expect(() =>
      assertNarrationFitsVisual(visual, {
        ...fittingNarration,
        hasAudio: false,
      }),
    ).toThrow(/no audio stream/);
  });
});
