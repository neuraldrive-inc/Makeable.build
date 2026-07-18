import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the Makeable shell loads with meaningful semantic content", async ({ page }) => {
  await page.goto("/build/new");

  await expect(page).toHaveTitle("What do you want to make? · Makeable");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Build progress" })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Makeable" })).toBeAttached();
  await expect(page.getByRole("status")).toHaveText(
    "What do you want to make? screen loaded.",
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "./assets/icons/lucide/sparkles.svg",
  );
  await expect(page.locator("img.brand-spark")).toBeVisible();
});

test("build routes load the SPA directly and guard unavailable progress", async ({ page }) => {
  const directResponse = await page.goto("/build/new");

  expect(directResponse.ok()).toBe(true);
  await expect(page.getByRole("status")).toHaveText(
    "What do you want to make? screen loaded.",
  );
  await page.goto("/build/code");
  await expect(page).toHaveURL(/\/build\/new$/);
});

test("project and image mutations persist across a completed-screen direct reload", async ({
  page,
}) => {
  await page.goto("/build/new");
  await expect
    .poll(() => page.evaluate(() => typeof window.MAKEABLE_APP?.completeRoute))
    .toBe("function");

  await page.evaluate(async () => {
    for (const path of [
      "/build/new",
      "/build/parts/upload",
      "/build/parts/review",
      "/build/feasibility/ready",
      "/build/assemble",
      "/build/code",
    ]) {
      await window.MAKEABLE_APP.completeRoute(path);
    }
    await window.MAKEABLE_APP.saveImage(
      "source",
      new Blob(["persisted image"], { type: "image/png" }),
    );
  });

  await page.goto("/build/code");
  await expect(page).toHaveURL(/\/build\/code$/);
  await expect
    .poll(() =>
      page.evaluate(() => window.MAKEABLE_APP?.getProject().progress.completedRoutes),
    )
    .toContain("/build/code");
  const image = await page.evaluate(async () => {
    const blob = await window.MAKEABLE_APP.loadImage("source");
    return { text: await blob.text(), type: blob.type };
  });
  expect(image).toEqual({ text: "persisted image", type: "image/png" });
});

test("legacy settings migrate on startup without retaining the Deepgram secret", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "geckco.settings",
      JSON.stringify({
        deepgramApiKey: "legacy-browser-secret",
        githubOwner: "maker",
      }),
    );
  });

  await page.goto("/build/new");

  const settings = await page.evaluate(() => ({
    current: localStorage.getItem("makeable.settings"),
    legacy: localStorage.getItem("geckco.settings"),
  }));
  expect(settings.legacy).toBeNull();
  expect(JSON.parse(settings.current)).toEqual({ githubOwner: "maker" });
  expect(settings.current).not.toContain("legacy-browser-secret");
});

test("skip navigation moves keyboard focus to the application content", async ({ page }) => {
  await page.goto("/build/new");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to project builder" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("the shell has no serious accessibility violations", async ({ page }) => {
  await page.goto("/build/new");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blockingViolations = results.violations.filter(({ impact }) =>
    ["serious", "critical"].includes(impact),
  );

  expect(blockingViolations).toEqual([]);
});

test("the shell stays within the viewport", async ({ page }) => {
  await page.goto("/build/new");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("the self-hosted fonts are served as browser font assets", async ({ page, request }) => {
  await page.goto("/build/new");

  for (const fontPath of [
    "/assets/fonts/fredoka/fredoka.woff2",
    "/assets/fonts/nunito-sans/nunito-sans.woff2",
    "/assets/fonts/shantell-sans/shantell-sans.woff2",
    "/assets/fonts/roboto-mono/roboto-mono.woff2",
  ]) {
    const response = await request.get(fontPath);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toBe("font/woff2");
  }

  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "Nunito Sans"')))
    .toBe(true);
});
