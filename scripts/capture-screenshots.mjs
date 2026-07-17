import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

const baseURL = process.env.MORROWWARD_URL ?? "http://127.0.0.1:4189";
const outputDirectory = new URL("../docs/screenshots/", import.meta.url);
const requireSourcedData = process.env.MORROWWARD_REQUIRE_SOURCED_DATA
  ? process.env.MORROWWARD_REQUIRE_SOURCED_DATA === "1"
  : new URL(baseURL).hostname === "morrowward.vercel.app";

function screenshotPath(name) {
  return fileURLToPath(new URL(name, outputDirectory));
}

async function finishAnimations(page) {
  await page.locator(".view-stack").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
}

async function finishElementAnimations(locator) {
  await locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
}

async function waitForVisibleImages(page) {
  await page.locator("img:visible").evaluateAll(async (images) => {
    await Promise.all(
      images.map(async (image) => {
        if (image.complete && image.naturalWidth > 0) return;
        try {
          await image.decode();
        } catch {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }
      }),
    );
  });
}

async function waitForTodayData(page) {
  await page.getByTestId("daily-brief").waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="daily-brief"]')?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 30_000 },
  );
  await waitForVisibleImages(page);
}

async function waitForPracticeData(page) {
  const panel = page.getByTestId("practice-market-panel");
  await panel.waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="practice-market-panel"]')?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 30_000 },
  );
  if (requireSourcedData) {
    await page
      .getByTestId("practice-market-source-status")
      .filter({ hasText: "Real Prices Updated Every 24 Hours" })
      .waitFor({ timeout: 30_000 });
  }
  return panel;
}

async function setStickyHeaderVisible(page, visible) {
  await page.locator(".app-header").evaluate((element, shouldShow) => {
    element.style.visibility = shouldShow ? "" : "hidden";
  }, visible);
}

async function capturePage(page, name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
  await waitForVisibleImages(page);
  await finishAnimations(page);
  await page.screenshot({ path: screenshotPath(name) });
}

async function captureElement(page, locator, name) {
  await locator.scrollIntoViewIfNeeded();
  await finishElementAnimations(locator);
  await setStickyHeaderVisible(page, false);
  await locator.screenshot({ path: screenshotPath(name) });
  await setStickyHeaderVisible(page, true);
}

async function setDesktopTheme(page, theme) {
  await page.locator(".app-header").getByTestId(`theme-${theme}`).click();
}

async function setMobileTheme(page, theme) {
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("navigation", { name: "Mobile menu" })
    .getByRole("button", { name: /Settings/i })
    .click();
  await page.getByRole("heading", { name: /Your plan belongs to you/i }).waitFor();
  const appearance = page.locator(".setting-card").filter({ hasText: "Choose a theme" });
  await appearance.getByTestId(`theme-${theme}`).click();
}

async function onboard(page) {
  await page.goto(baseURL);
  await page.getByRole("heading", { name: /Small steps/i }).waitFor();
  await page.getByTestId("experience-new").click();
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("onboarding-theme-horizon").click();
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("plan-current-age").fill("30");
  await page.getByTestId("plan-target-age").fill("65");
  await page.getByTestId("plan-starting-balance").fill("0");
  await page.getByTestId("plan-weekly-contribution").fill("25");
  await page.getByTestId("onboarding-complete").click();
  await page.getByRole("heading", { name: /future is still in motion/i }).waitFor();
  const greeting = page.getByTestId("historical-greeting-dialog");
  const greetingAppeared = await greeting
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true, () => false);
  if (greetingAppeared) {
    await greeting.getByRole("button", { name: /^Skip welcome$/i }).click();
    await greeting.waitFor({ state: "hidden" });
  }
  await finishAnimations(page);
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });

try {
  const desktop = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const desktopPage = await desktop.newPage();
  await onboard(desktopPage);
  await waitForTodayData(desktopPage);
  await capturePage(desktopPage, "today-horizon-desktop.png");
  await captureElement(
    desktopPage,
    desktopPage.getByTestId("daily-brief"),
    "daily-brief-horizon-desktop.png",
  );

  await setDesktopTheme(desktopPage, "dawn");
  await desktopPage.getByTestId("nav-plan").click();
  await desktopPage.getByRole("heading", { name: /Change the inputs/i }).waitFor();
  await capturePage(desktopPage, "horizon-plan-dawn-desktop.png");

  await setDesktopTheme(desktopPage, "alchemy");
  await desktopPage.getByTestId("nav-mission").click();
  await desktopPage.getByRole("heading", { name: /Hope gets stronger/i }).waitFor();
  await capturePage(desktopPage, "mission-story-desktop.png");

  await setDesktopTheme(desktopPage, "space");
  await desktopPage.getByTestId("nav-learn").click();
  await desktopPage.getByRole("heading", { name: /Understanding is a form of freedom/i }).waitFor();
  await desktopPage.getByTestId("education-path-understand-risk").click();
  await capturePage(desktopPage, "education-center-space-desktop.png");

  await desktopPage.getByTestId("nav-practice").click();
  await desktopPage.getByRole("heading", { name: /Learn the motion/i }).waitFor();
  const practiceMarket = await waitForPracticeData(desktopPage);
  await capturePage(desktopPage, "practice-space-desktop.png");
  await captureElement(desktopPage, practiceMarket, "practice-market-space-desktop.png");
  await desktopPage.getByTestId("practice-asset-info-SPCX").click();
  await desktopPage.getByText(/Synthetic teaching data—not actual historical performance/i).waitFor();
  const desktopDetail = desktopPage.getByTestId("practice-asset-detail");
  await finishElementAnimations(desktopDetail);
  await desktopDetail.screenshot({ path: screenshotPath("spcx-detail-space-desktop.png") });
  await desktopPage.getByRole("button", { name: /Close SPCX details/i }).click();
  const marketJourney = desktopPage.getByTestId("market-journey");
  await marketJourney.waitFor();
  await desktopPage.getByTestId("market-risk-higher").click();
  await desktopPage.getByTestId("market-sequence-late-bear").click();
  await captureElement(desktopPage, marketJourney, "market-journey-space-desktop.png");
  await desktop.close();

  const mobile = await browser.newContext({
    ...devices["Pixel 7"],
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
  });
  const mobilePage = await mobile.newPage();
  await onboard(mobilePage);
  await waitForTodayData(mobilePage);
  await capturePage(mobilePage, "today-horizon-mobile.png");

  await setMobileTheme(mobilePage, "dawn");
  await mobilePage.getByTestId("mobile-nav-plan").click();
  await mobilePage.getByRole("heading", { name: /Change the inputs/i }).waitFor();
  await capturePage(mobilePage, "horizon-plan-dawn-mobile.png");

  await setMobileTheme(mobilePage, "alchemy");
  await mobilePage.getByTestId("mobile-nav-practice").click();
  await mobilePage.getByRole("heading", { name: /Learn the motion/i }).waitFor();
  await waitForPracticeData(mobilePage);
  await capturePage(mobilePage, "practice-mobile.png");
  await mobilePage.getByTestId("practice-asset-info-SPCX").click();
  await mobilePage.getByText(/Synthetic teaching data—not actual historical performance/i).waitFor();
  await finishElementAnimations(mobilePage.getByTestId("practice-asset-detail"));
  await mobilePage.screenshot({ path: screenshotPath("spcx-detail-mobile.png") });
  await mobilePage.getByRole("button", { name: /Close SPCX details/i }).click();

  await setMobileTheme(mobilePage, "space");
  await mobilePage.getByTestId("mobile-nav-practice").click();
  await mobilePage.getByTestId("market-risk-higher").click();
  await mobilePage.getByTestId("market-sequence-late-bear").click();
  await mobilePage.getByTestId("market-journey-chart").scrollIntoViewIfNeeded();
  await finishAnimations(mobilePage);
  await mobilePage.screenshot({ path: screenshotPath("market-journey-space-mobile.png") });

  await mobilePage.getByTestId("mobile-nav-learn").click();
  await mobilePage.getByRole("heading", { name: /Understanding is a form of freedom/i }).waitFor();
  await mobilePage.getByTestId("education-path-understand-risk").click();
  await capturePage(mobilePage, "education-center-space-mobile.png");

  await mobilePage.getByTestId("mobile-nav-mission").click();
  await mobilePage.getByRole("heading", { name: /Hope gets stronger/i }).waitFor();
  await capturePage(mobilePage, "mission-space-mobile.png");
  await mobile.close();
} finally {
  await browser.close();
}

console.log(`Captured Morrowward screenshots from ${baseURL} in docs/screenshots.`);
