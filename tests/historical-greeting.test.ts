import { describe, expect, it } from "vitest";
import {
  GREETING_ROSTER,
  GREETING_WELCOME_STORAGE_KEY,
  clearGreetingWelcomeState,
  chooseGreetingIdFromRoster,
  getOrCreateGreetingWelcomeState,
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
  it("contains only the approved Marcus greeting", () => {
    expect(GREETING_ROSTER.map((greeting) => greeting.id)).toEqual([
      "marcus-aurelius-v1",
    ]);
  });

  it("persists one stable selection instead of rotating on later visits", () => {
    const storage = memoryStorage();
    const first = getOrCreateGreetingWelcomeState(storage, 0);
    const later = getOrCreateGreetingWelcomeState(storage, 0.999);

    expect(later).toEqual(first);
    expect(later.seen).toBe(false);
  });

  it("selects deterministically across a future approved multi-person roster", () => {
    const futureRoster = [{ id: "marcus" }, { id: "lincoln" }] as const;

    expect(chooseGreetingIdFromRoster(futureRoster, 0.49)).toBe("marcus");
    expect(chooseGreetingIdFromRoster(futureRoster, 0.5)).toBe("lincoln");
    expect(chooseGreetingIdFromRoster(futureRoster, 0.999)).toBe("lincoln");
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
