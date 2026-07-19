import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the public homepage explains Makeable with one Google waitlist action", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(
    "Turn ideas into working physical products in hours. · Makeable",
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Turn ideas into working physical products in hours.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toHaveCount(0);
  await expect(page.locator(".launch-tag")).toContainText(
    "Early access opens August 9",
  );
  await expect(page.locator("[data-story-stage]")).toBeVisible();
  await expect(page.locator("[data-story-chapter]")).toHaveCount(3);
  await expect(page.locator("[data-story-frame]")).toHaveCount(3);
  await expect(
    page.getByRole("slider", { name: "Reveal Makeable part recognition" }),
  ).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /pilot/i })).toHaveCount(0);
});

test("landing UI is semantic instead of screenshot-derived", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".makeable-wordmark-text")).toHaveText("Makeable");
  await expect(page.locator(".launch-poster")).toContainText(
    "Early access opens August 9, 2026",
  );
  await expect(page.locator(".launch-poster img")).toHaveCount(0);
  await expect(page.locator(".paper-card")).toHaveCount(4);
  await expect(page.locator("[data-story-frame] img.story-image")).toHaveCount(3);
  await expect(page.locator("[data-story-chapter] h2")).toHaveCount(3);
});

test("the approved split layout keeps the signup rail pinned beside the story", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/");

  const stickySignup = page.locator("[data-sticky-signup]");
  const scrollingStory = page.locator("[data-scroll-story]");
  const googleButton = page.getByRole("button", { name: "Continue with Google" });
  const initialSignupBox = await stickySignup.boundingBox();
  const initialStoryBox = await scrollingStory.boundingBox();
  const initialButtonBox = await googleButton.boundingBox();

  expect(initialSignupBox.width).toBeGreaterThanOrEqual(520);
  expect(initialSignupBox.width).toBeLessThanOrEqual(660);
  expect(initialSignupBox.height).toBeGreaterThanOrEqual(1000);
  expect(initialStoryBox.x).toBeGreaterThanOrEqual(initialSignupBox.width - 2);
  expect(initialStoryBox.width).toBeGreaterThanOrEqual(760);
  expect(initialButtonBox.width).toBeGreaterThanOrEqual(460);
  expect(initialButtonBox.height).toBeGreaterThanOrEqual(80);
  await expect(stickySignup).toHaveCSS("position", "fixed");

  await page
    .locator('[data-story-chapter="test"]')
    .scrollIntoViewIfNeeded();

  const scrolledSignupBox = await stickySignup.boundingBox();
  expect(Math.abs(scrolledSignupBox.y)).toBeLessThanOrEqual(1);
  await expect(googleButton).toBeVisible();
});

test("the 1536 by 1024 landing composition matches the approved reference proportions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/");

  const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
        : null;
    };

    return {
      rail: box(".waitlist-hero"),
      headline: box(".hero-message h1"),
      poster: box(".launch-tag"),
      signup: box(".google-slot"),
      comparison: box(".comparison-media"),
      recognize: box('[data-story-chapter="recognize"]'),
      connect: box('[data-story-chapter="connect"]'),
      test: box('[data-story-chapter="test"]'),
      headlineFontSize: parseFloat(
        getComputedStyle(document.querySelector(".hero-message h1")).fontSize,
      ),
    };
  });

  expect(metrics.rail.width).toBeGreaterThanOrEqual(600);
  expect(metrics.rail.width).toBeLessThanOrEqual(612);
  expect(metrics.headline.x).toBeGreaterThanOrEqual(40);
  expect(metrics.headline.x).toBeLessThanOrEqual(48);
  expect(metrics.headline.y).toBeGreaterThanOrEqual(108);
  expect(metrics.headline.y).toBeLessThanOrEqual(124);
  expect(metrics.headlineFontSize).toBeGreaterThanOrEqual(62);
  expect(metrics.headlineFontSize).toBeLessThanOrEqual(66);
  expect(metrics.poster.width).toBeGreaterThanOrEqual(470);
  expect(metrics.poster.height).toBeGreaterThanOrEqual(240);
  expect(metrics.signup.width).toBeGreaterThanOrEqual(520);
  expect(metrics.signup.height).toBeGreaterThanOrEqual(100);
  expect(metrics.comparison.height).toBeGreaterThanOrEqual(388);
  expect(metrics.comparison.height).toBeLessThanOrEqual(400);
  expect(metrics.recognize.height).toBeGreaterThanOrEqual(184);
  expect(metrics.recognize.height).toBeLessThanOrEqual(194);
  expect(metrics.connect.height).toBeGreaterThanOrEqual(164);
  expect(metrics.connect.height).toBeLessThanOrEqual(174);
  expect(metrics.test.height).toBeGreaterThanOrEqual(232);
  expect(metrics.test.height).toBeLessThanOrEqual(242);
});

test("comparison and process stages are separate paper cards", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/");

  const cards = await page
    .locator(".landing-story-column .paper-card")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          top: rect.top,
          bottom: rect.bottom,
          border: style.borderTopWidth,
          shadow: style.boxShadow,
        };
      }),
    );

  expect(cards).toHaveLength(4);
  for (let index = 1; index < cards.length; index += 1) {
    expect(cards[index].top - cards[index - 1].bottom).toBeGreaterThanOrEqual(8);
  }
  expect(cards.every(({ border }) => border === "1px")).toBe(true);
  expect(cards.every(({ shadow }) => shadow !== "none")).toBe(true);
});

test("the landing story uses the exact approved recognize connect and test content", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 2, name: "Recognize" }),
  ).toBeVisible();
  await expect(page.getByText("We found 6 things!")).toBeVisible();
  await expect(page.getByText("Breadboard", { exact: true })).toBeVisible();
  await expect(page.getByText("Arduino Uno", { exact: true })).toBeVisible();
  await expect(page.getByText("DC Motor", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Connect" }),
  ).toBeVisible();
  await expect(page.getByText("We’ll wire it up.")).toBeVisible();
  await expect(page.getByText("VCC → 5V", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Test" }),
  ).toBeVisible();
  await expect(page.getByText("We’ll test everything.")).toBeVisible();
});

test("the workbench comparison can be dragged and changed with the keyboard", async ({
  page,
}) => {
  await page.goto("/");

  const comparison = page.locator("[data-comparison]");
  const deskPhoto = comparison.locator(".comparison-photo");
  const recognitionLayer = comparison.locator(
    "[data-comparison-recognition-layer]",
  );
  const slider = page.getByRole("slider", {
    name: "Reveal Makeable part recognition",
  });

  await expect(deskPhoto).toHaveCount(1);
  await expect(deskPhoto).toHaveAttribute(
    "src",
    "/assets/landing/desk-parts.jpeg",
  );
  await expect(recognitionLayer).toHaveCount(1);
  await expect(comparison.locator(".part-outline")).toHaveCount(3);
  await expect(comparison.locator(".part-callout")).toHaveCount(3);

  await slider.scrollIntoViewIfNeeded();
  await expect(slider).toHaveValue("50");
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("51");
  await expect(comparison).toHaveCSS("--comparison-reveal", "51%");
  await expect(recognitionLayer).toHaveCSS(
    "clip-path",
    "inset(0px 0px 0px 51%)",
  );

  const geometry = await comparison.evaluate((root) => {
    const target = root
      .querySelector(".comparison-annotation-frame")
      .getBoundingClientRect();
    return [...root.querySelectorAll(".part-outline")].map((outline) => {
      const rect = outline.getBoundingClientRect();
      return {
        insidePhoto:
          rect.left >= target.left - 6 &&
          rect.top >= target.top - 6 &&
          rect.right <= target.right + 6 &&
          rect.bottom <= target.bottom + 6,
        coverage: (rect.width * rect.height) / (target.width * target.height),
      };
    });
  });

  expect(geometry.every(({ insidePhoto }) => insidePhoto)).toBe(true);
  expect(geometry.every(({ coverage }) => coverage < 0.18)).toBe(true);

  const fixedGeometry = [];
  for (const value of [20, 50, 80]) {
    await slider.fill(String(value));
    fixedGeometry.push(
      await comparison.evaluate((root) => {
        const photo = root
          .querySelector(".comparison-photo-frame")
          .getBoundingClientRect();
        const outline = root.querySelector(".part-outline").getBoundingClientRect();
        return {
          photo: {
            x: photo.x,
            y: photo.y,
            width: photo.width,
            height: photo.height,
          },
          outline: {
            x: outline.x,
            y: outline.y,
            width: outline.width,
            height: outline.height,
          },
        };
      }),
    );
  }

  const [baseline, ...changed] = fixedGeometry;
  for (const geometryAtValue of changed) {
    for (const target of ["photo", "outline"]) {
      for (const property of ["x", "y", "width", "height"]) {
        expect(
          Math.abs(
            geometryAtValue[target][property] - baseline[target][property],
          ),
        ).toBeLessThanOrEqual(1);
      }
    }
  }
});

test("process cards use hardware imagery with semantic diagnostics", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.locator('[data-story-frame="recognize"] .story-image'),
  ).toHaveAttribute("src", "/assets/landing/recognize-hardware.png");
  await expect(
    page.locator('[data-story-frame="connect"] .story-image'),
  ).toHaveAttribute("src", "/assets/landing/connect-hardware.png");
  await expect(
    page.locator('[data-story-frame="test"] .story-image'),
  ).toHaveAttribute("src", "/assets/landing/test-hardware.png");
  await expect(page.locator(".demo-status-row")).toHaveCount(4);
  await expect(page.locator(".demo-progress")).toHaveAttribute("value", "87");
});

test("Google configuration errors remain beside the signup control as an alert", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Continue with Google" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("GOOGLE_CLIENT_ID");
  await expect(alert).toHaveAttribute("data-tone", "error");
  await expect
    .poll(() =>
      alert.evaluate(
        (element) => getComputedStyle(element, "::before").fontFamily,
      ),
    )
    .toMatch(/Nunito Sans/);
});

test("public Google signup verifies through the server and confirms the waitlist", async ({
  page,
}) => {
  let requestBody;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload) => {
        window.__makeableSharedPayload = payload;
      },
    });
  });
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
              window.__makeableGoogleCallback({ credential: "verified-waitlist-credential" });
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
        user: { email: "maker@example.com", name: "Maker Person", picture: "" },
      }),
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Continue with Google" }).click();

  expect(requestBody).toEqual({
    credential: "verified-waitlist-credential",
    intent: "waitlist",
  });
  await expect(page.getByRole("heading", { name: "You’re on the list." })).toBeVisible();
  await expect(
    page.getByText("We’ll send your Makeable early-access invitation before August 9."),
  ).toBeVisible();
  await expect(page.locator(".hero-signup")).toHaveAccessibleName(
    "You’re on the list.",
  );
  await expect(page.getByRole("status")).toContainText("Waitlist signup complete.");
  const shareButton = page.getByRole("button", { name: "Share Makeable" });
  await expect
    .poll(() => shareButton.evaluate((button) => button.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(48);
  const successAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    successAccessibility.violations.filter(({ impact }) =>
      ["serious", "critical"].includes(impact),
    ),
  ).toEqual([]);
  await shareButton.click();
  await expect
    .poll(() => page.evaluate(() => window.__makeableSharedPayload))
    .toMatchObject({
      title: "Makeable",
      url: "http://127.0.0.1:8787/",
    });
});

test("landing photography and product screens keep their intended crop", async ({ page }) => {
  await page.goto("/");

  const heroPhoto = page.getByRole("img", {
    name: "An ESP32, PIR motion sensor, and OLED display on a workbench",
  });
  const productScreen = page.getByRole("img", {
    name:
      "A breadboard, Arduino Uno, motor, LED, resistor, wires, and battery pack on a desk",
  });

  await expect(heroPhoto).toBeVisible();
  await expect(productScreen).toBeVisible();
  await expect(heroPhoto).toHaveCSS("object-fit", "cover");
  await expect(productScreen).toHaveCSS("object-fit", "cover");
});

test("mobile story frames stay in normal flow without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const storyFrames = page.locator("[data-story-frame]");
  await expect(storyFrames).toHaveCount(3);

  const frameLayouts = await storyFrames.evaluateAll((frames) =>
    frames.map((frame) => ({
      height: frame.getBoundingClientRect().height,
      position: getComputedStyle(frame).position,
    })),
  );
  for (const { height, position } of frameLayouts) {
    expect(position).not.toMatch(/^(absolute|fixed|sticky)$/);
    expect(height).toBeGreaterThan(0);
  }

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("mobile signup enters sticky mode only after its source position leaves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const signup = page.locator(".hero-signup");
  await expect(signup).toHaveCSS("position", "relative");
  await expect(signup).not.toHaveClass(/is-mobile-sticky/);

  await page
    .locator('[data-story-chapter="connect"]')
    .scrollIntoViewIfNeeded();
  await expect(signup).toHaveClass(/is-mobile-sticky/);
  await expect(signup).toHaveCSS("position", "fixed");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();

  const clearance = await page.evaluate(() => {
    const signup = document.querySelector(".hero-signup");
    const rect = signup.getBoundingClientRect();
    return {
      paddingBottom: parseFloat(getComputedStyle(document.body).paddingBottom),
      signupHeight: signup.getBoundingClientRect().height,
      leftGutter: rect.left,
      rightGutter: window.innerWidth - rect.right,
    };
  });
  expect(clearance.leftGutter).toBeCloseTo(20, 0);
  expect(clearance.rightGutter).toBeCloseTo(20, 0);
  expect(clearance.paddingBottom).toBeGreaterThanOrEqual(
    clearance.signupHeight + 12,
  );
});

test("tablet hero stacks instead of squeezing the signup copy", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto("/");

  const heroLayout = await page.locator(".waitlist-hero").evaluate((hero) => ({
    columns: getComputedStyle(hero).gridTemplateColumns.split(" ").length,
    messageWidth: hero.querySelector(".hero-message")?.getBoundingClientRect().width,
  }));

  expect(heroLayout.columns).toBe(1);
  expect(heroLayout.messageWidth).toBeGreaterThan(650);
});

test("mobile navigation links remain tappable and use the mobile photo crop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const controls = page.locator(
    ".waitlist-nav .makeable-wordmark, .text-link, .waitlist-footer .makeable-wordmark",
  );
  const heights = await controls.evaluateAll((elements) =>
    elements
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => element.getBoundingClientRect().height),
  );
  expect(heights.every((height) => height >= 44)).toBe(true);

  await expect(page.locator(".hero-photo")).toHaveCSS("object-position", "50% 45%");
});

test("landing motion is limited to transform and opacity", async ({ page }) => {
  await page.goto("/");

  const transitionProperties = await page
    .locator(".google-fallback, [data-story-frame]")
    .evaluateAll((elements) =>
      elements.flatMap((element) =>
        getComputedStyle(element).transitionProperty
          .split(",")
          .map((property) => property.trim()),
      ),
    );

  expect(
    transitionProperties.every((property) =>
      ["none", "opacity", "transform"].includes(property),
    ),
  ).toBe(true);
});

test("the hero and story banners use the approved mixed type system", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".hero-message h1")).toHaveCSS(
    "font-family",
    /Fredoka/,
  );
  await expect(page.locator(".story-copy h2").first()).toHaveCSS(
    "font-family",
    /Shantell Sans/,
  );
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
