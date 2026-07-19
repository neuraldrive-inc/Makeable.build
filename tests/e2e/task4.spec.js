import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const project = {
  idea: { text: "Build a self-watering plant" },
  photo: {
    imageId: "source",
    width: 1200,
    height: 800,
    mimeType: "image/jpeg",
    revision: "task-4",
  },
  confirmedParts: [
    {
      id: "board",
      name: "ESP32 DevKit",
      bounds: { x: 18, y: 20, width: 34, height: 50 },
      confirmed: true,
    },
    {
      id: "sensor",
      name: "Soil sensor",
      bounds: { x: 62, y: 18, width: 20, height: 56 },
      confirmed: true,
    },
  ],
  feasibility: {
    status: "ready",
    projectTitle: "Plant helper",
    summary: "Water a plant when the soil is dry.",
    firmwareSpec: {
      board: "ESP32 DevKit",
      behavior: "Water the plant when the sensor reads dry.",
    },
    diagnostics: {
      tests: [
        { id: "board", name: "Board responds", kind: "board", assemblyStep: 1 },
        { id: "sensor", name: "Sensor reads", kind: "sensor", assemblyStep: 2 },
        {
          id: "pump",
          name: "Pump spins",
          kind: "actuator",
          pulseMs: 650,
          assemblyStep: 2,
        },
        { id: "power", name: "Power stays steady", kind: "power", assemblyStep: 1 },
      ],
      manualAction:
        "Lift the sensor out of the soil, wait 2 seconds, and watch for water.",
      manualQuestion: "Did water reach the plant?",
      manualSuccessLabel: "Yes, it watered the plant",
    },
  },
  wiring: {
    steps: [
      {
        order: 1,
        title: "Connect the board",
        instruction: "Connect the sensor ground to the board ground.",
        from: "Soil sensor",
        to: "ESP32 DevKit",
        fromPartId: "sensor",
        toPartId: "board",
        pin: "GND → GND",
        wireColor: "black",
        explanation: "A shared ground lets both parts agree on the signal.",
        check: "The USB cable is unplugged while you wire.",
      },
      {
        order: 2,
        title: "Connect the signal",
        instruction: "Connect the sensor signal to GPIO 34.",
        from: "Soil sensor",
        to: "ESP32 DevKit",
        fromPartId: "sensor",
        toPartId: "board",
        pin: "SIG → GPIO 34",
        wireColor: "yellow",
        explanation: "This wire carries the soil reading.",
        check: "The wire is fully seated.",
      },
    ],
    currentStep: 0,
    completedSteps: [],
  },
  firmware: {
    language: "Arduino C++",
    sketch: "void setup() { Serial.begin(115200); }\nvoid loop() {}",
    notes: "Keep the pump dry while loading.",
  },
  tests: null,
  publish: null,
  progress: {
    completedRoutes: [
      "/build/new",
      "/build/parts/upload",
      "/build/parts/review",
      "/build/feasibility/ready",
    ],
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__task4 = { flashes: 0, writes: [], closes: 0 };
    window.MAKEABLE_HARDWARE = {
      async compileAndFlashFirmware({ onProgress }) {
        window.__task4.flashes += 1;
        onProgress({ phase: "compile", percent: 15, label: "Compiling" });
        onProgress({ phase: "flash", percent: 70, label: "Application 70%" });
        return { boardName: "ESP32-S3", fqbn: "esp32:esp32:esp32" };
      },
      async createDiagnosticSession({ onText }) {
        onText("MAKEABLE|READY|ESP32-S3\n");
        return {
          serialOutput: "MAKEABLE|READY|ESP32-S3\n",
          async write(command) {
            window.__task4.writes.push(command);
          },
          async waitForMarker(predicate) {
            return [
              { type: "ready", board: "ESP32-S3" },
              { type: "check", id: "sensor", status: "pass", detail: "value=41" },
              { type: "check", id: "pump", status: "pass", detail: "pulse complete" },
            ].find(predicate);
          },
          async observePower() {
            return { markers: [], sessionHealthy: true, observedMs: 2500 };
          },
          async close() {
            window.__task4.closes += 1;
          },
        };
      },
      async evaluateManualTest({
        requestedAction,
        imageDataUrl,
        serialOutput,
      }) {
        window.__task4.manualEvidence = {
          requestedAction,
          hasCameraFrame: imageDataUrl.startsWith("data:image/jpeg"),
          serialOutput,
        };
        return {
          responseId: "resp_manual",
          status: "pass",
          observations: ["Water is visible beside the plant."],
          nextStep: "Keep the electronics dry.",
        };
      },
    };
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(
      navigator.mediaDevices,
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        ...(navigator.mediaDevices || {}),
        async getUserMedia(constraints) {
          if (!constraints.video) return originalGetUserMedia(constraints);
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 360;
          const context = canvas.getContext("2d");
          context.fillStyle = "#9FDCC9";
          context.fillRect(0, 0, canvas.width, canvas.height);
          return canvas.captureStream();
        },
      },
    });
  });
  await page.route("**/api/esp32/status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        hasArduinoCli: true,
        hasEsp32Core: true,
        fqbn: "esp32:esp32:esp32",
      }),
    }),
  );
  await page.route("**/api/openai/responses", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "resp_manual",
        output_text: JSON.stringify({
          status: "pass",
          observations: ["Water is visible beside the plant."],
          nextStep: "Keep the electronics dry.",
        }),
      }),
    }),
  );
});

test("assembly, flash, automatic test, and manual acknowledgement use real route DOM and persisted state", async ({
  page,
}) => {
  await seed(page, project, "/build/assemble");

  await expect(
    page.getByRole("heading", { level: 1, name: "Step 1 of 2: Connect the board" }),
  ).toBeVisible();
  await expect(page.getByAltText("Your uploaded parts with this connection highlighted")).toBeVisible();
  await page.getByRole("button", { name: "Watch this move." }).click();
  await expect(page.locator(".assembly-photo-panel")).toHaveClass(/is-animating/);
  await page.getByRole("button", { name: "I connected it" }).click();
  await expect(page.getByRole("heading", { name: "Step 2 of 2: Connect the signal" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Step 2 of 2: Connect the signal" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Step 1 of 2: Connect the board" })).toBeVisible();
  await page.getByRole("button", { name: "Connection 2" }).click();
  await page.getByRole("button", { name: "I connected it" }).click();

  await expect(page).toHaveURL(/\/build\/code$/);
  await expect(page.getByText("Configured board: ESP32 DevKit")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your board software is ready" })).toBeVisible();
  await expect(page.getByLabel("Firmware code")).toHaveCount(0);
  await page.getByRole("button", { name: "Load to my ESP32" }).click();

  await expect(page).toHaveURL(/\/build\/test\/automatic$/);
  await expect(page.getByText("Board found: ESP32-S3")).toBeVisible();
  await page.getByRole("button", { name: "Start automatic check" }).click();
  await expect(page.getByText("Hardware check passed · 4 of 4")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__task4.closes)).toBe(1);
  await page.getByRole("button", { name: "Your turn" }).click();

  await expect(page).toHaveURL(/\/build\/test\/manual$/);
  await page.getByRole("button", { name: "Start camera" }).click();
  await page.getByRole("button", { name: "Capture evidence" }).click();
  await page.getByRole("button", { name: "Yes, it watered the plant" }).click();
  await expect(page).toHaveURL(/\/build\/publish\/connect$/);

  const stored = await page.evaluate(() => window.MAKEABLE_APP.getProject());
  expect(stored.wiring.completedSteps).toEqual([0, 1]);
  expect(stored.firmware.flash).toMatchObject({
    status: "success",
    boardName: "ESP32-S3",
    fqbn: "esp32:esp32:esp32",
  });
  expect(stored.tests.automatic.checks.map(({ status }) => status)).toEqual([
    "pass",
    "pass",
    "pass",
    "pass",
  ]);
  expect(stored.tests.manual).toMatchObject({
    acknowledged: true,
    evidenceImageId: "manual-evidence",
    evaluation: { responseId: "resp_manual", status: "pass" },
  });
  expect(await page.evaluate(() => window.__task4.writes)).toEqual([
    "MAKEABLE|RUN|sensor|0\n",
    "MAKEABLE|RUN|pump|650\n",
    "MAKEABLE|STOP|pump\n",
  ]);
  expect(await page.evaluate(() => window.__task4.manualEvidence)).toMatchObject({
    requestedAction:
      "Lift the sensor out of the soil, wait 2 seconds, and watch for water.",
    hasCameraFrame: true,
    serialOutput: "MAKEABLE|READY|ESP32-S3\n",
  });
});

test("an uncertain manual evaluation cannot certify or publish the project", async ({
  page,
}) => {
  const manualProject = {
    ...project,
    firmware: {
      ...project.firmware,
      flash: { status: "success", boardName: "ESP32 DevKit" },
    },
    tests: {
      automatic: {
        status: "pass",
        checks: [{ id: "board", name: "Board responds", status: "pass" }],
        serialOutput: "MAKEABLE|READY|ESP32\n",
      },
    },
    progress: {
      completedRoutes: [
        ...project.progress.completedRoutes,
        "/build/assemble",
        "/build/code",
        "/build/test/automatic",
      ],
    },
  };
  await seed(page, manualProject, "/build/test/manual");
  await page.evaluate(() => {
    window.MAKEABLE_HARDWARE.evaluateManualTest = async () => ({
      responseId: "resp_uncertain",
      status: "uncertain",
      observations: ["The expected movement is not visible."],
      nextStep: "Move the project into frame and retry.",
    });
  });

  await page.getByRole("button", { name: "Start camera" }).click();
  await page.getByRole("button", { name: "Capture evidence" }).click();
  await page.getByRole("button", { name: "Yes, it watered the plant" }).click();

  await expect(page).toHaveURL(/\/build\/test\/manual$/);
  await expect(page.getByText(/Move the project into frame and retry/)).toBeVisible();
  const stored = await page.evaluate(() => window.MAKEABLE_APP.getProject());
  expect(stored.tests.manual).toMatchObject({
    acknowledged: false,
    userReportedSuccess: true,
    evaluation: { status: "uncertain" },
  });
  expect(stored.progress.completedRoutes).not.toContain("/build/test/manual");
});

test("Task 4 routes are accessible and contained at desktop, tablet, and mobile widths", async ({
  page,
}) => {
  test.slow();
  const states = [
    ["/build/assemble", project],
    [
      "/build/code",
      {
        ...project,
        progress: {
          completedRoutes: [...project.progress.completedRoutes, "/build/assemble"],
        },
      },
    ],
    [
      "/build/test/automatic",
      {
        ...project,
        firmware: {
          ...project.firmware,
          flash: { status: "success", boardName: "ESP32-S3" },
        },
        progress: {
          completedRoutes: [
            ...project.progress.completedRoutes,
            "/build/assemble",
            "/build/code",
          ],
        },
      },
    ],
    [
      "/build/test/manual",
      {
        ...project,
        firmware: {
          ...project.firmware,
          flash: { status: "success", boardName: "ESP32-S3" },
        },
        tests: {
          automatic: {
            status: "pass",
            checks: project.feasibility.diagnostics.tests.map((check) => ({
              ...check,
              status: "pass",
            })),
          },
        },
        progress: {
          completedRoutes: [
            ...project.progress.completedRoutes,
            "/build/assemble",
            "/build/code",
            "/build/test/automatic",
          ],
        },
      },
    ],
  ];

  for (const [path, state] of states) {
    await seed(page, state, path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter(({ impact }) => ["serious", "critical"].includes(impact)),
      `${path} accessibility`,
    ).toEqual([]);
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll, `${path} horizontal overflow`).toBeLessThanOrEqual(widths.client);
  }
});

async function seed(page, state, path) {
  await page.goto("/build/new");
  await page.waitForFunction(() => Boolean(window.MAKEABLE_APP));
  await page.evaluate(async ({ state: next, path: nextPath }) => {
    const photo = await fetch("/test%20image.jpg").then((response) => response.blob());
    await window.MAKEABLE_APP.saveImage("source", photo);
    await window.MAKEABLE_APP.replaceProject({
      ...window.MAKEABLE_APP.getProject(),
      ...structuredClone(next),
    });
    window.MAKEABLE_APP.navigation.navigate(nextPath);
  }, { state, path });
}
