import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the public homepage explains Makeable and offers only Google or email signup", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Make hardware. Make it real. · Makeable");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Turn the parts on your desk into something real.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join the waitlist" })).toBeVisible();
  await expect(page.locator("[data-build-stage]")).toHaveCount(5);
  await expect(page.getByRole("link", { name: /pilot/i })).toHaveCount(0);
});

test("email signup posts one field and ends in the immediate confirmation state", async ({
  page,
}) => {
  let requestBody;
  await page.route("**/api/waitlist", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.goto("/");

  await page.getByRole("textbox", { name: "Email address" }).fill("Maker@Example.com");
  await page.getByRole("button", { name: "Join the waitlist" }).click();

  expect(requestBody).toEqual({ email: "Maker@Example.com" });
  await expect(page.getByRole("heading", { name: "You’re on the list." })).toBeVisible();
  await expect(
    page.getByText("We’ll send your Makeable early-access invitation before August 8."),
  ).toBeVisible();
});

test("the forwardable pilot page is Google-only", async ({ page }) => {
  await page.goto("/pilot");

  await expect(page).toHaveTitle("Pilot access · Makeable");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your pilot bench is ready." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toHaveCount(0);
  await expect(page.getByText("Anyone with this link can join the pilot.")).toBeVisible();
});

test("pilot Google sign-in verifies through the server contract and opens the builder", async ({
  page,
}) => {
  let requestBody;
  await page.route("**/config.local.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body:
        'window.MAKEABLE_CONFIG = { googleClientId: "test-client" };' +
        "window.CIRCUIT_CODEX_CONFIG = window.MAKEABLE_CONFIG;",
    });
  });
  await page.route("https://accounts.google.com/gsi/client", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: `
        window.google = { accounts: { id: {
          initialize(options) { window.__makeableGoogleCallback = options.callback; },
          renderButton(target) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Continue with Google";
            button.addEventListener("click", () => {
              window.__makeableGoogleCallback({ credential: "verified-test-credential" });
            });
            target.append(button);
          }
        } } };
      `,
    });
  });
  await page.route("**/api/auth/google", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        user: { email: "pilot@example.com", name: "Pilot Maker", picture: "" },
        next: "/build/new",
      }),
    });
  });

  await page.goto("/pilot");
  await page.getByRole("button", { name: "Continue with Google" }).click();

  expect(requestBody).toEqual({
    credential: "verified-test-credential",
    intent: "pilot",
  });
  await expect(page).toHaveURL(/\/build\/new$/);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(sessionStorage.getItem("makeable.pilot"))),
    )
    .toMatchObject({
      authenticated: true,
      user: { email: "pilot@example.com", name: "Pilot Maker" },
    });
});

test("landing and pilot pages have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/", "/pilot"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blockingViolations = results.violations.filter(({ impact }) =>
      ["serious", "critical"].includes(impact),
    );
    expect(blockingViolations, `${path} accessibility`).toEqual([]);
  }
});

test("the landing page stays inside every configured viewport", async ({ page }) => {
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
