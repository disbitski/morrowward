import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

async function openView(page: Page, view: "plan" | "practice" | "learn") {
  const desktop = page.getByTestId(`nav-${view}`);
  if (await desktop.isVisible()) {
    await desktop.click();
    return;
  }
  await page.getByTestId(`mobile-nav-${view}`).click();
}

async function openSettings(page: Page) {
  const desktop = page.getByTestId("nav-settings");
  if (await desktop.isVisible()) {
    await desktop.click();
    return;
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}

async function onboard(
  page: Page,
  options: { leaveGreetingOpen?: boolean } = {},
) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Small steps/i })).toBeVisible();
  await page.getByTestId("experience-new").click();
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("onboarding-theme-horizon").click();
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("plan-current-age").fill("30");
  await page.getByTestId("plan-target-age").fill("65");
  await page.getByTestId("plan-starting-balance").fill("1000");
  await page.getByTestId("plan-weekly-contribution").fill("25");
  await page.getByTestId("onboarding-complete").click();
  await expect(page.getByRole("heading", { name: /future is still in motion/i })).toBeVisible();
  const greeting = page.getByTestId("historical-greeting-dialog");
  await expect(greeting).toBeVisible();
  if (!options.leaveGreetingOpen) {
    await greeting.getByRole("button", { name: /^Skip welcome$/i }).click();
    await expect(greeting).not.toBeVisible();
  }
}

async function openMission(page: Page) {
  const desktop = page.getByTestId("nav-mission");
  if (await desktop.isVisible()) {
    await desktop.click();
    return;
  }
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("navigation", { name: "Mobile menu" })
    .getByRole("button", { name: /Our why/i })
    .click();
}

test("one-time historical welcome never autoplays and guides the next practice step", async ({ page }) => {
  await onboard(page, { leaveGreetingOpen: true });
  const dialog = page.getByTestId("historical-greeting-dialog");
  await expect(
    dialog.getByRole("heading", { name: /Congratulations—you started your journey/i }),
  ).toBeFocused();
  await expect(dialog.getByText(/AI-generated historical interpretation/i).first()).toBeVisible();
  await expect(dialog.getByText(/not Marcus Aurelius’s voice/i)).toBeVisible();

  const video = dialog.locator("video");
  await expect(video).not.toHaveAttribute("autoplay", /.*/u);
  await expect(video.locator('track[kind="captions"]')).toHaveAttribute(
    "src",
    "/morrowward-marcus-welcome.en.vtt",
  );
  await dialog.getByTestId("historical-greeting-play").click();
  await expect(video).toHaveAttribute("controls", "");

  await video.dispatchEvent("ended");
  const practice = dialog.getByTestId("historical-greeting-practice");
  await expect(practice).toBeVisible();
  await expect(practice).toBeInViewport();
  await practice.click();
  await expect(page.getByRole("heading", { name: /Learn the motion/i })).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(
        window.localStorage.getItem("morrowward.historical-greeting.v1") ??
          "{}",
      ),
    ),
  ).toMatchObject({ greetingId: "marcus-aurelius-v1", seen: true });

  await page.reload();
  await page.waitForTimeout(900);
  await expect(page.getByTestId("historical-greeting-dialog")).toHaveCount(0);

  await openMission(page);
  await expect(page.getByTestId("historical-greeting-replay")).toBeVisible();
  await page.getByTestId("historical-greeting-replay").click();
  await expect(page.getByTestId("historical-greeting-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("historical-greeting-dialog")).toHaveCount(0);
});

test("golden path stays educational, local, and fully simulated", async ({ page }, testInfo) => {
  await onboard(page);
  await expect(page.getByText("Local & private", { exact: true })).toHaveCount(0);

  await openView(page, "plan");
  await expect(page.getByRole("heading", { name: /Change the inputs/i })).toBeVisible();
  await page.getByTestId("plan-edit-current-age").fill("30.5");
  await expect(page.getByTestId("plan-edit-current-age")).toHaveValue("31");
  await page.getByTestId("scenario-900").click();
  await expect(page.getByText("Not a forecast").first()).toBeVisible();

  await openView(page, "practice");
  await expect(page.getByRole("heading", { name: /Learn the motion/i })).toBeVisible();
  await expect(page.getByTestId(/^practice-market-asset-/)).toHaveCount(11);
  await expect(page.getByTestId("practice-market-source-status")).toContainText(/Updated daily from current market sources|Practice data available offline/i);
  await expect(page.getByRole("button", { name: /Refresh prices/i })).toHaveCount(0);
  await page.getByTestId("practice-asset-info-SPCX").click();
  const assetDetail = page.getByTestId("practice-asset-detail");
  await expect(assetDetail).toBeVisible();
  const detailWidth = await assetDetail.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(detailWidth.scrollWidth).toBeLessThanOrEqual(detailWidth.clientWidth);
  await expect(page.getByRole("heading", { name: /Space Exploration Technologies/i })).toBeVisible();
  await expect(page.getByText(/Synthetic teaching data—not actual historical performance/i)).toBeVisible();
  await page.getByRole("button", { name: /Close SPCX details/i }).click();
  await page.getByTestId("practice-deposit").click();
  await page.getByTestId("select-practice-asset-TSLA").click();
  await page.getByTestId("practice-buy-amount").fill("10");
  await page.getByTestId("practice-buy").click();
  await expect(page.getByText(/TSLA simulated purchase/i)).toBeVisible();
  await expect(page.getByText(/nothing was traded/i)).toBeVisible();
  await expect(page.getByTestId("market-journey")).toBeVisible();
  await page.getByTestId("market-horizon-5").click();
  await page.getByTestId("market-growth-900").click();
  await page.getByTestId("market-risk-higher").click();
  await page.getByTestId("market-sequence-late-bear").click();
  await expect(page.getByTestId("market-recovery-status")).toContainText(/not regained in this horizon/i);
  await expect(page.getByRole("heading", { name: /Days you can’t predict/i })).toBeVisible();
  await expect(page.getByText("All simulated days included")).toBeVisible();

  await openView(page, "learn");
  await page.getByTestId("educator-chip-0").click();
  await page.getByTestId("educator-submit").click();
  await expect(page.locator(".educator-response")).toBeVisible();
  await expect(page.getByText(/Deterministic fallback|GPT-5\.6 generated|Safety-guided response/i)).toBeVisible();

  await openSettings(page);
  await expect(page.getByRole("heading", { name: /Your plan belongs to you/i })).toBeVisible();
  const appearanceCard = page.locator(".setting-card").filter({ hasText: "Choose a theme" });
  await appearanceCard.getByTestId("theme-space").click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "space");
  await expect(page.locator('meta[name="theme-color"][data-morrowward]')).toHaveAttribute("content", "#050608");
  const downloadEvent = page.waitForEvent("download");
  await page.getByTestId("settings-export").click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("morrowward-backup.json");
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  await page.locator('input[type="file"]').setInputFiles(backupPath!);
  await expect(page.getByText(/Backup restored/i)).toBeVisible();

  if (testInfo.project.name === "desktop-chrome") {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /future is still in motion/i })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /Skip to main content/i })).toBeFocused();
  }

  await openSettings(page);
  await page.getByTestId("settings-reset").click();
  await page.getByTestId("settings-reset").click();
  await expect(page.getByRole("heading", { name: /Small steps/i })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("morrowward.historical-greeting.v1"),
      ),
    )
    .toBeNull();
});

test("practice failures stay labeled and the asset dialog restores focus", async ({ page }) => {
  let historyRequests = 0;
  await page.route("**/api/v1/quotes**", async (route) => {
    if (route.request().url().includes("history=1y")) historyRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "deliberate browser-test outage" }),
    });
  });

  await onboard(page);
  await openView(page, "practice");
  await expect(page.getByRole("alert").filter({ hasText: /Current sources are temporarily unavailable/i })).toBeVisible();
  await expect(page.getByTestId(/^practice-market-asset-/)).toHaveCount(11);
  await expect(page.getByTestId("practice-market-source-status")).toHaveText("Practice data available offline");

  const detailTrigger = page.getByTestId("practice-asset-info-SPCX");
  await detailTrigger.click();
  const detail = page.getByTestId("practice-asset-detail");
  await expect(detail).toBeVisible();
  await expect(page.getByRole("button", { name: /Close SPCX details/i })).toBeFocused();
  await expect(page.getByText(/Historical context could not be loaded/i)).toBeVisible();
  const beforeRetry = historyRequests;
  await page.getByRole("button", { name: /Try history again/i }).click();
  await expect.poll(() => historyRequests).toBeGreaterThan(beforeRetry);
  await expect(page.getByText(/Historical context could not be loaded/i)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();
  await expect(detailTrigger).toBeFocused();

  await detailTrigger.click();
  await expect(detail).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(detail).not.toBeVisible();
  await expect(detailTrigger).toBeFocused();
});

test("PWA reloads offline and has no serious automated accessibility violations", async ({ context, page }) => {
  test.setTimeout(60_000);
  await onboard(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.json$/u);
  const manifest = await page.evaluate(async () => {
    const response = await fetch("/manifest.json");
    return response.json() as Promise<{ display: string; icons: Array<{ src: string }> }>;
  });
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service workers unavailable");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: /future is still in motion/i })).toBeVisible();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.addScriptTag({ content: axe.source });
  for (const theme of ["dawn", "horizon", "alchemy", "space"] as const) {
    await openSettings(page);
    const appearanceCard = page.locator(".setting-card").filter({ hasText: "Choose a theme" });
    await appearanceCard.getByTestId(`theme-${theme}`).click();
    await openView(page, "practice");
    await expect(page.getByTestId("market-journey")).toBeVisible();
    await page.locator(".view-stack").evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      });
      return result.violations
        .filter((item) => item.impact === "serious" || item.impact === "critical")
        .map((item) => ({
          id: item.id,
          impact: item.impact,
          help: item.help,
          nodes: item.nodes.map((node) => ({ target: node.target, html: node.html, summary: node.failureSummary })),
        }));
    });
    expect(violations, `${theme} theme accessibility violations`).toEqual([]);
  }

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /future is still in motion/i })).toBeVisible();
});

declare global {
  interface Window {
    axe: typeof axe;
  }
}
