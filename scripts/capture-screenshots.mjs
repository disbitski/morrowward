import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

const baseURL = process.env.MORROWWARD_URL ?? "http://127.0.0.1:4189";
const outputDirectory = new URL("../docs/screenshots/", import.meta.url);

async function finishAnimations(page) {
  await page.locator(".view-stack").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
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
  await desktopPage.screenshot({ path: fileURLToPath(new URL("today-horizon-desktop.png", outputDirectory)) });

  await desktopPage.getByTestId("nav-mission").click();
  await desktopPage.getByRole("heading", { name: /Hope gets stronger/i }).waitFor();
  await finishAnimations(desktopPage);
  await desktopPage.screenshot({ path: fileURLToPath(new URL("mission-story-desktop.png", outputDirectory)) });
  await desktop.close();

  const mobile = await browser.newContext({
    ...devices["Pixel 7"],
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
  });
  const mobilePage = await mobile.newPage();
  await onboard(mobilePage);
  await mobilePage.getByTestId("mobile-nav-practice").click();
  await mobilePage.getByRole("heading", { name: /Learn the motion/i }).waitFor();
  await finishAnimations(mobilePage);
  await mobilePage.screenshot({ path: fileURLToPath(new URL("practice-mobile.png", outputDirectory)) });
  await mobile.close();
} finally {
  await browser.close();
}

console.log("Captured Morrowward screenshots in docs/screenshots.");
