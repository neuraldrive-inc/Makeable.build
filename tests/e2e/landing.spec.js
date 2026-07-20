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
  await expect(
    page.locator('.launch-poster img[src*="launch-poster-reference"]'),
  ).toHaveCount(0);
  await expect(page.locator(".launch-poster img")).toHaveCount(0);
  await expect(page.locator(".hero-underline-art img")).toHaveCount(0);
  await expect(page.locator(".hero-marker-rays img")).toHaveCount(0);
  await expect(page.locator(".hand-underline img")).toHaveCount(0);
  await expect(page.locator(".story-doodle-arrow img")).toHaveCount(0);
  await expect(page.locator(".grid-tape img")).toHaveCount(0);
  await expect(page.locator(".grid-tape")).toHaveCount(4);
  await expect(page.locator(".wire-chips li")).toHaveCount(3);
  await expect(page.locator(".demo-check")).toHaveCount(4);
  await expect(page.locator(".demo-status-row strong")).toHaveText([
    "OK",
    "OK",
    "OK",
    "OK",
  ]);
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
  expect(metrics.headlineFontSize).toBeGreaterThanOrEqual(76);
  expect(metrics.headlineFontSize).toBeLessThanOrEqual(80);
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
    expect(cards[index].top - cards[index - 1].bottom).toBeGreaterThanOrEqual(5);
    expect(cards[index].top - cards[index - 1].bottom).toBeLessThanOrEqual(8);
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
  await expect(slider).toHaveValue("44.3");
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("44.4");
  await expect(comparison).toHaveCSS("--comparison-reveal", "44.4%");
  await expect(recognitionLayer).toHaveCSS(
    "clip-path",
    "inset(0px 0px 0px 44.4%)",
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
  ).toHaveAttribute("src", "/assets/landing/recognize-hardware-clean-v2.png");
  await expect(
    page.locator('[data-story-frame="connect"] .story-image'),
  ).toHaveAttribute("src", "/assets/landing/connect-hardware-clean.png");
  await expect(
    page.locator('[data-story-frame="test"] .story-image'),
  ).toHaveAttribute("src", "/assets/landing/test-hardware-clean-v2.png");
  await expect(page.locator(".story-tape.grid-tape")).toHaveCount(2);
  await expect(page.locator(".demo-status-row")).toHaveCount(4);
  await expect(page.locator(".demo-check")).toHaveCount(4);
  await expect(page.locator(".demo-status-row strong")).toHaveText([
    "OK",
    "OK",
    "OK",
    "OK",
  ]);
  await expect(page.locator(".demo-progress")).toHaveAttribute("value", "87");
});

test("coded landing components remain inside their cards at key widths", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1536, height: 1024 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const geometry = await page.evaluate(() => {
      const within = (childSelector, parentSelector, tolerance = 1) => {
        const child = document.querySelector(childSelector)?.getBoundingClientRect();
        const parent = document.querySelector(parentSelector)?.getBoundingClientRect();
        return Boolean(
          child &&
            parent &&
            child.left >= parent.left - tolerance &&
            child.right <= parent.right + tolerance,
        );
      };

      return {
        documentFits:
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
        wiresFit: within(".wire-chips", '.story-scene--connect .story-copy'),
        statusFits: within(".demo-status", '.story-scene--test .story-visual'),
      };
    });

    expect(geometry.documentFits).toBe(true);
    expect(geometry.wiresFit).toBe(true);
    expect(geometry.statusFits).toBe(true);
  }
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
          prompt() {
            window.__makeableGoogleCallback({ credential: "verified-waitlist-credential" });
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

  const googleButton = page.getByRole("button", { name: "Continue with Google" });
  await expect
    .poll(() =>
      googleButton.evaluate((button) => {
        const slotWidth = button.parentElement.getBoundingClientRect().width;
        return button.getBoundingClientRect().width / slotWidth;
      }),
    )
    .toBeGreaterThan(0.92);
  await expect
    .poll(() => googleButton.evaluate((button) => button.getBoundingClientRect().height))
    .toBeGreaterThan(80);
  await googleButton.click();

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
    tapePercentageOverlap: (() => {
      const tape = document.querySelector(".status-tape").getBoundingClientRect();
      const percentage = document
        .querySelector(".demo-progress-row strong")
        .getBoundingClientRect();
      const width = Math.max(
        0,
        Math.min(tape.right, percentage.right) -
          Math.max(tape.left, percentage.left),
      );
      const height = Math.max(
        0,
        Math.min(tape.bottom, percentage.bottom) -
          Math.max(tape.top, percentage.top),
      );
      return width * height;
    })(),
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.tapePercentageOverlap).toBe(0);
});

test("mobile signup remains visible while its source position is away", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const signup = page.locator(".hero-signup");
  const signupAnchor = page.locator("[data-signup-anchor]");
  await signupAnchor.scrollIntoViewIfNeeded();
  await expect(signup).not.toHaveClass(/is-mobile-sticky/);
  await expect(signup).toHaveCSS("position", "relative");

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

  await page
    .locator('[data-story-chapter="connect"]')
    .scrollIntoViewIfNeeded();
  await expect(page.locator(".hero-signup")).toHaveClass(/is-mobile-sticky/);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeInViewport({ ratio: 0.98 });

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const bottomClearance = await page.evaluate(() => {
    const diagnostics = document.querySelector(".demo-status").getBoundingClientRect();
    const stickySignup = document.querySelector(".hero-signup").getBoundingClientRect();
    return stickySignup.top - diagnostics.bottom;
  });
  expect(bottomClearance).toBeGreaterThanOrEqual(8);
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
          prompt() {
            window.__makeableGoogleCallback({ credential: "verified-test-credential" });
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

test("the approved composition remains usable across the full responsive matrix", async ({
  page,
}) => {
  const viewports = [
    { width: 1536, height: 1024 },
    { width: 1440, height: 1024 },
    { width: 1024, height: 768 },
    { width: 834, height: 1194 },
    { width: 768, height: 1024 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForTimeout(200);

    const measurements = await page.evaluate(() => {
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      };
      const viewportIntersectionRatio = (element) => {
        const rect = element.getBoundingClientRect();
        const visibleWidth = Math.max(
          0,
          Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left),
        );
        const visibleHeight = Math.max(
          0,
          Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top),
        );
        return (visibleWidth * visibleHeight) / (rect.width * rect.height);
      };
      const headlineSpans = [...document.querySelectorAll(".hero-message h1 > span")];
      const cards = [...document.querySelectorAll(".landing-story-column .paper-card")];
      const comparison = document.querySelector(".comparison-photo-frame");
      const annotation = document.querySelector(".comparison-annotation-frame");
      const posterElement = document.querySelector(".launch-poster");
      const signupElement = document.querySelector(".hero-signup");
      const paperStyles = cards.map((card) => getComputedStyle(card));

      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        googleVisibility: viewportIntersectionRatio(
          document.querySelector(".google-fallback"),
        ),
        headlineLineCount: headlineSpans.length,
        headlineSpanWraps: headlineSpans.map((span) => {
          const range = document.createRange();
          range.selectNodeContents(span.firstChild);
          return range.getClientRects().length;
        }),
        hero: box(document.querySelector(".waitlist-hero")),
        lede: box(document.querySelector(".hero-lede")),
        poster: box(document.querySelector(".launch-poster")),
        signup: box(document.querySelector(".hero-signup-anchor")),
        posterMarginTop: parseFloat(getComputedStyle(posterElement).marginTop),
        signupMarginTop: parseFloat(getComputedStyle(signupElement).marginTop),
        signupSticky: signupElement.classList.contains("is-mobile-sticky"),
        cardGaps: cards.slice(1).map(
          (card, index) =>
            card.getBoundingClientRect().top -
            cards[index].getBoundingClientRect().bottom,
        ),
        paperReady: paperStyles.every(
          (style) =>
            style.borderTopWidth === "1px" &&
            style.boxShadow !== "none" &&
            style.backgroundImage !== "none",
        ),
        comparisonDelta: {
          x: Math.abs(
            comparison.getBoundingClientRect().x -
              annotation.getBoundingClientRect().x,
          ),
          y: Math.abs(
            comparison.getBoundingClientRect().y -
              annotation.getBoundingClientRect().y,
          ),
          width: Math.abs(
            comparison.getBoundingClientRect().width -
              annotation.getBoundingClientRect().width,
          ),
          height: Math.abs(
            comparison.getBoundingClientRect().height -
              annotation.getBoundingClientRect().height,
          ),
        },
      };
    });

    expect(measurements.scrollWidth, `${viewport.width}px overflow`).toBeLessThanOrEqual(
      measurements.clientWidth,
    );
    expect(
      measurements.googleVisibility,
      `${viewport.width}px Google CTA visibility`,
    ).toBeGreaterThanOrEqual(0.98);
    expect(measurements.headlineLineCount).toBe(3);
    expect(measurements.headlineSpanWraps).toEqual([1, 1, 1]);
    expect(measurements.posterMarginTop).toBeGreaterThanOrEqual(10);
    if (!measurements.signupSticky) {
      expect(measurements.signupMarginTop).toBeGreaterThanOrEqual(10);
    }
    expect(measurements.paperReady).toBe(true);
    expect(Math.max(...Object.values(measurements.comparisonDelta))).toBeLessThanOrEqual(
      1,
    );

    if (viewport.width >= 1280) {
      expect(measurements.hero.left).toBeCloseTo(0, 0);
      expect(measurements.hero.top).toBeCloseTo(0, 0);
      expect(measurements.hero.width).toBeGreaterThanOrEqual(560);
      expect(measurements.cardGaps.every((gap) => gap >= 5 && gap <= 8)).toBe(
        true,
      );
    } else {
      expect(measurements.hero.top).toBeCloseTo(0, 0);
      expect(measurements.hero.width).toBeCloseTo(viewport.width, 0);
      if (viewport.width <= 700) {
        expect(measurements.cardGaps.every((gap) => gap >= 13 && gap <= 17)).toBe(
          true,
        );
      }
    }
  }
});
