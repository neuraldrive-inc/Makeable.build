import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publishProject = {
  idea: { text: "Build a self-watering plant" },
  photo: {
    imageId: "source",
    width: 1200,
    height: 800,
    mimeType: "image/jpeg",
    revision: "task-5",
  },
  confirmedParts: [
    { id: "board", name: "ESP32 DevKit", role: "Controller", confirmed: true },
    { id: "sensor", name: "Soil sensor", role: "Reads moisture", confirmed: true },
  ],
  feasibility: {
    status: "ready",
    projectTitle: "Self-Watering Plant",
    summary: "Waters a plant when the soil is dry.",
    firmwareSpec: {
      board: "ESP32 DevKit",
      behavior: "Water the plant when the sensor reads dry.",
    },
  },
  wiring: {
    steps: [
      {
        order: 1,
        title: "Connect the sensor",
        instruction: "Connect signal to GPIO 34.",
        check: "The wire is fully seated.",
      },
    ],
    completedSteps: [0],
  },
  firmware: {
    language: "Arduino C++",
    sketch: "void setup() {}\nvoid loop() {}\n",
    notes: "Keep electronics dry.",
    flash: { status: "success", boardName: "ESP32 DevKit" },
  },
  tests: {
    automatic: {
      status: "pass",
      checks: [
        { id: "board", name: "Board responds", status: "pass", detail: "OK" },
      ],
    },
    manual: {
      acknowledged: true,
      action: "Lift the sensor out of the soil.",
      evaluation: { status: "pass", observations: ["Water reached the plant."] },
    },
  },
  publish: null,
  progress: {
    completedRoutes: [
      "/build/new",
      "/build/parts/upload",
      "/build/parts/review",
      "/build/feasibility/ready",
      "/build/assemble",
      "/build/code",
      "/build/test/automatic",
      "/build/test/manual",
    ],
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/config.local.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.MAKEABLE_CONFIG = {
        githubOwner: "ray-builds",
        hasGithubToken: true,
        arduinoFqbn: "esp32:esp32:esp32"
      };
      window.CIRCUIT_CODEX_CONFIG = window.MAKEABLE_CONFIG;`,
    }),
  );
  await page.addInitScript(() => {
    window.MAKEABLE_CONFIG = {
      githubOwner: "ray-builds",
      hasGithubToken: true,
      arduinoFqbn: "esp32:esp32:esp32",
    };
    window.__task5 = { uploads: [], shares: [], copied: [] };
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload) => window.__task5.shares.push(payload),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value) {
          window.__task5.copied.push(value);
        },
      },
    });
  });
  await page.route("**/api/github/repos", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        owner: { login: "ray-builds" },
        html_url: "https://github.com/ray-builds/self-watering-plant",
      }),
    }),
  );
  await page.route("**/api/github/upload-file", async (route) => {
    const body = route.request().postDataJSON();
    await page.evaluate((payload) => window.__task5.uploads.push(payload), body);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ content: { sha: "new-sha" } }),
    });
  });
});

test("publish uploads all artifacts, Success actions work, and starting over preserves config", async ({
  page,
}) => {
  await seed(page, publishProject, "/build/publish/connect");

  await expect(
    page.getByRole("heading", { name: "You built it. Now share it." }),
  ).toBeVisible();
  await expect(page.getByText("README.md", { exact: true })).toBeVisible();
  await expect(page.getByText("Tested & working")).toBeVisible();
  await page.getByLabel("Repository name").fill("self-watering-plant");
  await page.getByLabel("Private").check();
  await page.getByRole("button", { name: "Connect GitHub & publish" }).click();

  await expect(page).toHaveURL(/\/build\/publish\/success$/);
  await expect(
    page.getByRole("heading", { name: "It’s live — you made hardware!" }),
  ).toBeVisible();
  await expect(page.getByText("ray-builds / self-watering-plant")).toBeVisible();
  await expect(page.getByText("Private", { exact: true })).toBeVisible();
  const uploads = await page.evaluate(() => window.__task5.uploads);
  expect(uploads.map(({ path }) => path)).toEqual([
    "README.md",
    "build-guide/README.md",
    "code/makeable.ino",
    "parts-list/README.md",
    "test-results/README.md",
  ]);

  await page.getByRole("button", { name: "Share project" }).click();
  await expect(page.getByText("Share sheet opened.")).toBeVisible();
  expect(await page.evaluate(() => window.__task5.shares.length)).toBe(1);

  const configBefore = await page.evaluate(() => window.MAKEABLE_CONFIG);
  await page.getByRole("button", { name: "Start another build" }).click();
  await expect(page).toHaveURL(/\/build\/new$/);
  expect(await page.evaluate(() => window.MAKEABLE_APP.getProject().idea)).toBeNull();
  expect(await page.evaluate(() => window.MAKEABLE_CONFIG)).toEqual(configBefore);
});

test("Publish and Success are accessible and contained at desktop, tablet, and mobile widths", async ({
  page,
}) => {
  const success = {
    ...publishProject,
    publish: {
      repositoryName: "self-watering-plant",
      owner: "ray-builds",
      visibility: "public",
      repositoryUrl: "https://github.com/ray-builds/self-watering-plant",
      uploadedPaths: [
        "README.md",
        "build-guide/README.md",
        "code/makeable.ino",
        "parts-list/README.md",
        "test-results/README.md",
      ],
    },
    progress: {
      completedRoutes: [
        ...publishProject.progress.completedRoutes,
        "/build/publish/connect",
      ],
    },
  };

  for (const [path, state] of [
    ["/build/publish/connect", publishProject],
    ["/build/publish/success", success],
  ]) {
    await seed(page, state, path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter(({ impact }) =>
        ["serious", "critical"].includes(impact),
      ),
      `${path} accessibility`,
    ).toEqual([]);
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll, `${path} horizontal overflow`).toBeLessThanOrEqual(
      widths.client,
    );
  }
});

async function seed(page, state, path) {
  await page.goto("/build/new");
  await page.waitForFunction(() => Boolean(window.MAKEABLE_APP));
  await page.evaluate(
    async ({ state: next, path: nextPath }) => {
      const photo = await fetch("/test%20image.jpg").then((response) =>
        response.blob(),
      );
      await window.MAKEABLE_APP.saveImage("source", photo);
      await window.MAKEABLE_APP.replaceProject({
        ...window.MAKEABLE_APP.getProject(),
        ...structuredClone(next),
      });
      window.MAKEABLE_APP.navigation.navigate(nextPath);
    },
    { state, path },
  );
}
