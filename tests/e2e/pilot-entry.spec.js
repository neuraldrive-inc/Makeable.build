import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const photoPath = `${process.cwd()}/test image.jpg`;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hasAccounts: false, hasOpenAIKey: true, apiBaseUrl: "" }),
    }),
  );
  await page.route("**/api/esp32/status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hasEsp32Compiler: true, hasEsp32Core: true }),
    }),
  );
  await page.goto("/pilot");
});

test("beginners can clearly choose prompt-first or photo-first", async ({ page }) => {
  await expect(page).toHaveTitle("Start with an idea or a photo · Makeable");
  await expect(page.getByRole("heading", { level: 1, name: /How would you like to start/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start with my idea" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Take or choose a photo" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Plant helper" }).click();
  await expect(page.getByLabel("Describe the hardware project you want to make")).toHaveValue(/self-watering plant/i);
  await expect(page.getByRole("button", { name: "Start with my idea" })).toBeEnabled();
});

test("photo-first waits for a useful label-side-up photo before AI analysis", async ({ page }) => {
  await page.locator("#partsPhotoInput").setInputFiles(photoPath);
  await expect(page.getByRole("heading", { level: 1, name: /Let’s get one useful photo/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suggest what I can build" })).toBeDisabled();
  await page.getByLabel("My parts are label-side up and easy to see.").check();
  await expect(page.getByRole("button", { name: "Suggest what I can build" })).toBeEnabled();
  await expect(page.getByText("Photo ready. I can now suggest a few realistic starter builds.")).toBeVisible();
});

test("the real workflow remains usable at a narrow mobile viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-specific responsive check");
  await expect(page.locator(".orientation-card")).toHaveCount(0);
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How would you like to start/i })).toBeVisible();
  const shellBox = await page.locator(".shell").boundingBox();
  expect(shellBox.x).toBeGreaterThanOrEqual(0);
  expect(shellBox.x + shellBox.width).toBeLessThanOrEqual(391);
});

test("the beginner entry has no serious accessibility violations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the semantic entry contract");
  await expect(page.locator('[data-workflow-stage="0"]')).toHaveAttribute("aria-current", "step");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(serious).toEqual([]);
});
