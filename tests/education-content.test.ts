import { describe, expect, it } from "vitest";
import { EDUCATION_TOPICS, EXPERIENCE_LEVELS } from "../src/contracts";
import {
  EDUCATION_PATH_IDS,
  EDUCATION_PATHS,
  EDUCATION_RESOURCES,
  educationPathForTopic,
  educationPrompts,
  educationResources,
  inferEducationTopic,
  relatedEducationPrompts,
  resourceTierLabel,
} from "../src/data";

describe("education center content", () => {
  it("defines four stable learning paths for every experience level", () => {
    expect(EDUCATION_PATH_IDS).toEqual([
      "start-here",
      "build-the-habit",
      "understand-risk",
      "go-deeper",
    ]);
    expect(EDUCATION_PATHS.map((path) => path.id)).toEqual(
      EDUCATION_PATH_IDS,
    );

    for (const pathId of EDUCATION_PATH_IDS) {
      for (const experience of EXPERIENCE_LEVELS) {
        expect(educationPrompts(pathId, experience)).toHaveLength(4);
      }
      expect(educationResources(pathId).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps prompt ids and wording unique, bounded, and API-compatible", () => {
    const prompts = EDUCATION_PATHS.flatMap((path) =>
      EXPERIENCE_LEVELS.flatMap((experience) => path.promptSets[experience]),
    );
    const ids = prompts.map((prompt) => prompt.id);
    const questions = prompts.map((prompt) => prompt.question);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(questions).size).toBe(questions.length);
    for (const prompt of prompts) {
      expect(EDUCATION_TOPICS).toContain(prompt.topic);
      expect(prompt.question.length).toBeGreaterThanOrEqual(3);
      expect(prompt.question.length).toBeLessThanOrEqual(600);
    }
  });

  it("labels Grokipedia only as supplemental reading", () => {
    const links = EDUCATION_RESOURCES.flatMap((resource) => resource.links);
    const grokipedia = links.filter((link) =>
      link.href.startsWith("https://grokipedia.com/"),
    );

    expect(grokipedia.length).toBeGreaterThanOrEqual(8);
    for (const link of links) {
      expect(link.href.startsWith("https://")).toBe(true);
    }
    for (const link of grokipedia) {
      expect(link.tier).toBe("supplemental");
      expect(resourceTierLabel(link.tier)).toBe(
        "Supplemental reading · Grokipedia",
      );
    }
    expect(
      links.some(
        (link) =>
          link.tier === "supplemental" &&
          !link.href.startsWith("https://grokipedia.com/"),
      ),
    ).toBe(false);
  });

  it("gives every resource topic a canonical or authoritative source", () => {
    const topicGroups = new Map<string, typeof EDUCATION_RESOURCES>();
    for (const resource of EDUCATION_RESOURCES) {
      const group = topicGroups.get(resource.topic) ?? [];
      group.push(resource);
      topicGroups.set(resource.topic, group);
    }

    for (const resources of topicGroups.values()) {
      expect(
        resources.some((resource) =>
          resource.links.some(
            (link) =>
              link.tier === "primary" || link.tier === "authoritative",
          ),
        ),
      ).toBe(true);
    }
  });

  it("resolves common questions and deterministic follow-ups", () => {
    expect(inferEducationTopic("Explain CAGR and annualized growth")).toBe(
      "compounding",
    );
    expect(inferEducationTopic("What is a 20% drawdown?")).toBe("volatility");
    expect(inferEducationTopic("How does weekly DCA work?")).toBe(
      "dollar-cost-averaging",
    );
    expect(inferEducationTopic("What does theta do to an option?")).toBe(
      "options",
    );
    expect(educationPathForTopic("crypto")).toBe("understand-risk");

    const current =
      educationPrompts("understand-risk", "new")[0].question;
    const related = relatedEducationPrompts(
      "volatility",
      "new",
      current,
    );
    expect(related).toHaveLength(3);
    expect(related.map((prompt) => prompt.question)).not.toContain(current);
  });
});
