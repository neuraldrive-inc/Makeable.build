import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

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

test("photo-first starts automatically and makes its progress unmistakable", async ({ page }) => {
  let releaseConfig;
  const configReady = new Promise((resolve) => {
    releaseConfig = resolve;
  });
  let releaseSuggestions;
  const suggestionsReady = new Promise((resolve) => {
    releaseSuggestions = resolve;
  });
  await page.route("**/api/openai/background", async (route) => {
    await suggestionsReady;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "completed",
        output_text: JSON.stringify({
          suggestions: [
            {
              title: "Motion hello light",
              description: "Turn on an LED when the visible motion sensor notices someone.",
              usesParts: ["ESP32", "PIR sensor", "LED"],
            },
            {
              title: "Desk movement counter",
              description: "Count movement events and show the total in the serial monitor.",
              usesParts: ["ESP32", "PIR sensor"],
            },
          ],
        }),
      }),
    });
  });
  await page.route("**/api/config", async (route) => {
    await configReady;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hasAccounts: false, hasOpenAIKey: true, apiBaseUrl: "" }),
    });
  });

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Take or choose a photo" }).first().click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(photoPath);

  await expect(page.getByRole("heading", { level: 1, name: /Let’s get one useful photo/i })).toBeVisible();
  await expect(page.getByText("No approval step.")).toBeVisible();
  await expect(page.locator("#orientationConfirmed")).toHaveCount(0);
  await expect(page.locator("#photoAnalysisProgress")).toBeVisible();
  await expect(page.locator("#photoAnalysisProgress")).toContainText("Finding build ideas");
  await expect(page.locator("#photoAnalysisProgress")).toContainText(/keep this tab open/i);
  await expect(page.locator("#analyzeButton")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#analyzeButton")).toBeDisabled();

  releaseConfig();
  releaseSuggestions();
  const firstIdea = page.getByRole("button", { name: /Motion hello light/i });
  await expect(firstIdea).toBeVisible();
  await expect(firstIdea).toBeFocused();
  await expect(page.locator("#photoAnalysisProgress")).toBeHidden();
  await expect(page.locator("#transcriptBox")).toContainText("Choose one idea below");
  await expect(page.locator("#analyzeButton")).toBeEnabled();
});

test("clearing a photo during startup cancels the stale suggestion request", async ({ page }) => {
  let releaseConfig;
  const configReady = new Promise((resolve) => {
    releaseConfig = resolve;
  });
  let backgroundRequests = 0;
  await page.route("**/api/config", async (route) => {
    await configReady;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hasAccounts: false, hasOpenAIKey: true, apiBaseUrl: "" }),
    });
  });
  await page.route("**/api/openai/background", (route) => {
    backgroundRequests += 1;
    return route.abort();
  });

  await page.locator("#partsPhotoInput").setInputFiles(photoPath);
  await expect(page.locator("#photoAnalysisProgress")).toBeVisible();
  await page.getByRole("button", { name: "Clear photo" }).click();
  releaseConfig();

  await expect(page.locator("#photoAnalysisProgress")).toBeHidden();
  await expect(page.locator("#analyzeButton")).toBeDisabled();
  await expect(page.locator("#transcriptBox")).toContainText("Choose one clear photo");
  await expect.poll(() => backgroundRequests).toBe(0);
});

test("replacing a photo during startup keeps only the newest suggestion request", async ({ page }) => {
  let releaseFirstConfig;
  const firstConfigReady = new Promise((resolve) => {
    releaseFirstConfig = resolve;
  });
  let configRequests = 0;
  const backgroundImages = [];
  await page.route("**/api/config", async (route) => {
    configRequests += 1;
    if (configRequests === 1) await firstConfigReady;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hasAccounts: false, hasOpenAIKey: true, apiBaseUrl: "" }),
    });
  });
  await page.route("**/api/openai/background", async (route) => {
    backgroundImages.push(route.request().postDataJSON().input[1].content[1].image_url);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "completed",
        output_text: JSON.stringify({
          suggestions: [
            {
              title: "Newest photo idea",
              description: "Use only the parts from the replacement photo.",
              usesParts: ["ESP32"],
            },
          ],
        }),
      }),
    });
  });

  await page.locator("#partsPhotoInput").setInputFiles(photoPath);
  await expect(page.locator("#photoAnalysisProgress")).toBeVisible();
  await expect.poll(() => configRequests).toBe(1);
  await page.locator("#partsPhotoInput").setInputFiles({
    name: "replacement-photo.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile(photoPath),
  });

  await expect.poll(() => configRequests).toBe(2);
  await expect(page.getByRole("button", { name: /Newest photo idea/i })).toBeVisible();
  releaseFirstConfig();
  await expect.poll(() => backgroundImages.length).toBe(1);
  expect(backgroundImages[0]).toMatch(/^data:image\/jpeg;base64,/);
});

test("photo-first keeps a visible retry message when suggestions fail", async ({ page }) => {
  await page.route("**/api/openai/background", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "The photo suggestion service rejected this request." }),
    }),
  );

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Take or choose a photo" }).first().click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(photoPath);

  await expect(page.locator("#transcriptBox")).toContainText("I couldn’t suggest a build from this photo yet");
  await expect(page.locator("#transcriptBox")).toHaveClass(/danger/);
  await expect(page.locator("#photoAnalysisProgress")).toBeHidden();
  await expect(page.locator("#analyzeButton")).toHaveText("Suggest what I can build");
  await expect(page.locator("#analyzeButton")).toBeEnabled();
  await expect(page.locator("#photoPickerLabel")).toHaveText("Replace photo");
});

test("an unreadable photo exits loading and offers an adjacent retry", async ({ page }) => {
  await page.locator("#partsPhotoInput").setInputFiles({
    name: "camera-photo.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("not an image"),
  });

  await expect(page.locator("#transcriptBox")).toContainText(/couldn’t read that image/i);
  await expect(page.locator("#transcriptBox")).toContainText(/JPG, PNG, or WebP/i);
  await expect(page.locator("#photoAnalysisProgress")).toBeHidden();
  await expect(page.locator("#photoPickerLabel")).toHaveText("Try another photo");
  await expect(page.locator("#analyzeButton")).toBeDisabled();
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
