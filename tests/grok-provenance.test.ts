import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  assertCompositionIsNotHumanApproved,
  assertExactRunArtifactPath,
  assertRecordedByteLength,
  assertRecordedSha256,
  assertReviewManifestShape,
  readReviewManifest,
  readReviewManifestOrInitialize,
} from "../scripts/grok/provenance-lib.mjs";
import { sha256Hex } from "../scripts/grok/media-lib.mjs";

describe("Grok composition provenance", () => {
  it("parses an existing object review manifest", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "morrowward-review-"));
    try {
      const path = resolve(directory, "review.json");
      await writeFile(path, '{"schemaVersion":1}\n');
      await expect(readReviewManifest(path)).resolves.toEqual({
        schemaVersion: 1,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("initializes only when review.json is absent", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "morrowward-review-"));
    try {
      const missing = resolve(directory, "missing.json");
      await expect(
        readReviewManifestOrInitialize(missing, () => ({ schemaVersion: 1 })),
      ).resolves.toEqual({ schemaVersion: 1 });

      const malformed = resolve(directory, "malformed.json");
      await writeFile(malformed, "{not-json");
      const initialize = vi.fn(() => ({ schemaVersion: 1 }));
      await expect(
        readReviewManifestOrInitialize(malformed, initialize),
      ).rejects.toThrow(/not valid JSON/);
      expect(initialize).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed on a structurally malformed review object", () => {
    expect(() => assertReviewManifestShape({}, "campaign")).toThrow(
      /schemaVersion 1/,
    );
    expect(() =>
      assertReviewManifestShape(
        {
          schemaVersion: 1,
          campaignId: "campaign",
          candidates: [],
          videos: [],
          selection: {},
          disclosure: "AI interpretation",
          caption: "Caption",
          source: {},
          reviewPolicy: {},
        },
        "other-campaign",
      ),
    ).toThrow(/does not match/);
  });

  it("never replaces composition metadata carrying human approval", () => {
    expect(() => assertCompositionIsNotHumanApproved({})).not.toThrow();
    expect(() =>
      assertCompositionIsNotHumanApproved({
        composed: { status: "pending-final-review", humanApproval: null },
      }),
    ).not.toThrow();

    expect(() =>
      assertCompositionIsNotHumanApproved({
        composed: {
          status: "approved-for-application-integration",
          humanApproval: {
            status: "approved",
            approvedBy: "Dave Isbitski",
            approvedAt: "2026-07-15T19:52:58Z",
            approvalBasisSha256: "a".repeat(64),
          },
        },
      }),
    ).toThrow(/human approval or its approval basis/);

    expect(() =>
      assertCompositionIsNotHumanApproved({
        composed: {
          status: "pending-final-review",
          approvalBasisSha256: "b".repeat(64),
        },
      }),
    ).toThrow(/human approval or its approval basis/);
  });

  it("locks artifacts to the exact recorded same-run filename", () => {
    const runDirectory = resolve(tmpdir(), "morrowward-run");
    const expected = resolve(runDirectory, "narration/narration.wav");
    expect(
      assertExactRunArtifactPath({
        runDirectory,
        actualPath: expected,
        recordedFilename: "narration/narration.wav",
        expectedFilename: "narration/narration.wav",
        label: "Narration",
      }),
    ).toBe(expected);

    expect(() =>
      assertExactRunArtifactPath({
        runDirectory,
        actualPath: resolve(runDirectory, "narration/renamed.wav"),
        recordedFilename: "narration/narration.wav",
        expectedFilename: "narration/narration.wav",
        label: "Narration",
      }),
    ).toThrow(/exact file recorded/);
    expect(() =>
      assertExactRunArtifactPath({
        runDirectory,
        actualPath: resolve(runDirectory, "../other-run/narration.wav"),
        recordedFilename: "../other-run/narration.wav",
        expectedFilename: "../other-run/narration.wav",
        label: "Narration",
      }),
    ).toThrow(/inside the selected composition run/);
  });

  it("requires exact recorded SHA-256 and byte length", () => {
    const buffer = Buffer.from("fresh hackathon artifact", "utf8");
    const digest = sha256Hex(buffer);
    expect(assertRecordedSha256(buffer, digest, "Artifact")).toBe(digest);
    expect(() =>
      assertRecordedSha256(buffer, "0".repeat(64), "Artifact"),
    ).toThrow(/no longer matches/);
    expect(() => assertRecordedSha256(buffer, "invalid", "Artifact")).toThrow(
      /valid recorded SHA-256/,
    );
    expect(() =>
      assertRecordedByteLength(buffer, buffer.length, "Artifact"),
    ).not.toThrow();
    expect(() =>
      assertRecordedByteLength(buffer, buffer.length + 1, "Artifact"),
    ).toThrow(/byte length/);
  });
});
