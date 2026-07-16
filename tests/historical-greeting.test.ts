import { describe, expect, it } from "vitest";
import {
  GREETING_ROSTER,
  GREETING_ROSTER_VERSION,
  GREETING_VIDEO_PRELOAD,
  GREETING_WELCOME_STORAGE_KEY,
  clearGreetingWelcomeState,
  chooseGreetingIdFromRoster,
  getOrCreateGreetingWelcomeState,
  greetingById,
  markGreetingWelcomeSeen,
} from "../app/components/HistoricalGreeting";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe("historical greeting selection", () => {
  it("keeps approved videos lazy until the person explicitly presses play", () => {
    expect(GREETING_VIDEO_PRELOAD).toBe("none");
  });

  it("contains both approved greetings with generalized replay metadata", () => {
    expect(GREETING_ROSTER.map((greeting) => greeting.id)).toEqual([
      "marcus-aurelius-v1",
      "benjamin-franklin-v1",
    ]);
    expect(GREETING_ROSTER_VERSION).toBe("2026-07-16");
    expect(greetingById("benjamin-franklin-v1")).toMatchObject({
      sourcePublisher: "Founders Online",
      posterAlt: expect.stringContaining("Benjamin Franklin"),
      videoSrc: "/morrowward-franklin-welcome.mp4",
    });
  });

  it("keeps an existing Marcus assignment stable after the roster expands", () => {
    const storage = memoryStorage();
    storage.setItem(
      GREETING_WELCOME_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        rosterVersion: "2026-07-15",
        greetingId: "marcus-aurelius-v1",
        seen: false,
      }),
    );
    const first = getOrCreateGreetingWelcomeState(storage, 0.999);
    const later = getOrCreateGreetingWelcomeState(storage, 0.999);

    expect(later).toEqual(first);
    expect(later.greetingId).toBe("marcus-aurelius-v1");
    expect(later.rosterVersion).toBe("2026-07-15");
    expect(later.seen).toBe(false);
  });

  it("selects deterministically across the approved two-person roster", () => {
    expect(chooseGreetingIdFromRoster(GREETING_ROSTER, 0.49)).toBe(
      "marcus-aurelius-v1",
    );
    expect(chooseGreetingIdFromRoster(GREETING_ROSTER, 0.5)).toBe(
      "benjamin-franklin-v1",
    );
    expect(chooseGreetingIdFromRoster(GREETING_ROSTER, 0.999)).toBe(
      "benjamin-franklin-v1",
    );

    const storage = memoryStorage();
    expect(getOrCreateGreetingWelcomeState(storage, 0.999)).toMatchObject({
      rosterVersion: "2026-07-16",
      greetingId: "benjamin-franklin-v1",
      seen: false,
    });
  });

  it("marks the selected greeting seen and clears it with a full reset", () => {
    const storage = memoryStorage();
    const selected = getOrCreateGreetingWelcomeState(storage);
    expect(markGreetingWelcomeSeen(storage, selected.greetingId).seen).toBe(
      true,
    );

    clearGreetingWelcomeState(storage);
    expect(storage.getItem(GREETING_WELCOME_STORAGE_KEY)).toBeNull();
  });

  it("replaces malformed local UI state with a bounded record", () => {
    const storage = memoryStorage();
    storage.setItem(GREETING_WELCOME_STORAGE_KEY, "not-json");

    expect(getOrCreateGreetingWelcomeState(storage)).toMatchObject({
      schemaVersion: 1,
      greetingId: "marcus-aurelius-v1",
      seen: false,
    });
  });
});
