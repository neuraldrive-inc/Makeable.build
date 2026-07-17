import { expect, test } from "@playwright/test";

const completedThroughCode = [
  "/build/new",
  "/build/parts/upload",
  "/build/parts/review",
  "/build/feasibility/ready",
  "/build/assemble",
  "/build/code",
];

test("missing-parts primary action stays in the 1440 by 1024 desktop frame", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await seed(page, missingPartsProject(), "/build/feasibility/missing");

  const action = page.getByRole("button", { name: "Shop missing parts" });
  await expect(action).toBeVisible();
  const box = await action.boundingBox();

  expect(box).not.toBeNull();
  expect(box.y + box.height).toBeLessThanOrEqual(1024);
});

test("retry clears stale flash success and persists failure before Auto Test can open", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.MAKEABLE_HARDWARE = {
      async compileAndFlashFirmware() {
        return new Promise((_resolve, reject) => {
          window.__failFlash = () =>
            reject(new Error("loader lost the serial port"));
        });
      },
    };
  });
  await page.route("**/api/arduino/status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        hasArduinoCli: true,
        hasEsp32Core: true,
        fqbn: "esp32:esp32:esp32",
      }),
    }),
  );
  await seed(page, codeProject(), "/build/code");

  await expect(page.getByText("Board found: ESP32-S3")).toBeVisible();
  await page.getByRole("button", { name: "Load code to my board" }).click();
  await expect
    .poll(() => page.evaluate(() => typeof window.__failFlash))
    .toBe("function");
  await expect(page.getByText(/Board found:/)).toHaveCount(0);
  await expect(page.getByText("Configured board: ESP32 DevKit")).toBeVisible();

  await page.evaluate(() => window.__failFlash());
  await expect(page.getByRole("button", { name: "Try loading again" })).toBeVisible();
  await expect(page.getByText(/Board found:/)).toHaveCount(0);
  await expect(page.getByText("Configured board: ESP32 DevKit")).toBeVisible();
  expect(
    await page.evaluate(() => window.MAKEABLE_APP.getProject().firmware.flash),
  ).toMatchObject({
    status: "failed",
    error: "loader lost the serial port",
  });
  await page.evaluate(() =>
    window.MAKEABLE_APP.navigation.navigate("/build/test/automatic"),
  );
  await expect(page).toHaveURL(/\/build\/code$/);
});

test("cancelling a retry keeps the live board success badge cleared", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.MAKEABLE_HARDWARE = {
      async compileAndFlashFirmware({ signal }) {
        return new Promise((_resolve, reject) => {
          window.__flashPending = true;
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Loading stopped.", "AbortError")),
            { once: true },
          );
        });
      },
    };
  });
  await page.route("**/api/arduino/status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        hasArduinoCli: true,
        hasEsp32Core: true,
        fqbn: "esp32:esp32:esp32",
      }),
    }),
  );
  await seed(page, codeProject(), "/build/code");

  await expect(page.getByText("Board found: ESP32-S3")).toBeVisible();
  await page.getByRole("button", { name: "Load code to my board" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__flashPending))
    .toBe(true);
  await expect(page.getByText(/Board found:/)).toHaveCount(0);

  await page.getByRole("button", { name: "Cancel loading" }).click();
  await expect(page.getByRole("button", { name: "Try loading again" })).toBeVisible();
  await expect(page.getByText(/Board found:/)).toHaveCount(0);
  await expect(page.getByText("Configured board: ESP32 DevKit")).toBeVisible();
  expect(
    await page.evaluate(() => window.MAKEABLE_APP.getProject().firmware.flash),
  ).toMatchObject({
    status: "cancelled",
  });
});

test("a camera permission result that arrives after navigation is stopped and ignored", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__lateCameraStops = 0;
    let resolveCamera;
    const pending = new Promise((resolve) => {
      resolveCamera = resolve;
    });
    window.__resolveLateCamera = () => {
      const canvas = document.createElement("canvas");
      const stream = canvas.captureStream();
      const track = stream.getTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        window.__lateCameraStops += 1;
        stop();
      };
      resolveCamera(stream);
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => pending,
      },
    });
  });
  await seed(page, manualProject(), "/build/test/manual");

  await page.getByRole("button", { name: "Start camera" }).click();
  await page.evaluate(() =>
    window.MAKEABLE_APP.navigation.navigate("/build/assemble"),
  );
  await page.evaluate(() => window.__resolveLateCamera());

  await expect.poll(() => page.evaluate(() => window.__lateCameraStops)).toBe(1);
  await expect(page).toHaveURL(/\/build\/assemble$/);
});

function codeProject() {
  return {
    idea: { text: "Build a plant helper" },
    feasibility: {
      status: "ready",
      firmwareSpec: { board: "ESP32 DevKit", behavior: "Water a dry plant." },
      diagnostics: { tests: [] },
    },
    wiring: { steps: [{ title: "Connect board" }], completedSteps: [0] },
    firmware: {
      language: "Arduino C++",
      sketch: "void setup() {}",
      notes: "",
      flash: {
        status: "success",
        boardName: "ESP32-S3",
        fqbn: "esp32:esp32:esp32",
      },
    },
    tests: { automatic: { status: "pass" } },
    progress: { completedRoutes: completedThroughCode },
  };
}

function manualProject() {
  return {
    ...codeProject(),
    feasibility: {
      status: "ready",
      firmwareSpec: { board: "ESP32 DevKit", behavior: "Water a dry plant." },
      diagnostics: {
        tests: [{ id: "board", name: "Board responds", kind: "board" }],
        manualAction: "Lift the sensor and watch for water.",
        manualQuestion: "Did water reach the plant?",
        manualSuccessLabel: "Yes, it watered the plant",
      },
    },
    wiring: {
      steps: [
        {
          title: "Connect board",
          instruction: "Connect the board.",
          check: "Wire is seated.",
        },
      ],
      completedSteps: [0],
    },
    tests: {
      automatic: {
        status: "pass",
        checks: [{ id: "board", name: "Board responds", status: "pass" }],
      },
    },
    progress: {
      completedRoutes: [...completedThroughCode, "/build/test/automatic"],
    },
  };
}

function missingPartsProject() {
  return {
    idea: { text: "Build a plant helper" },
    confirmedParts: [
      { id: "board", name: "ESP32 DevKit", confirmed: true },
      { id: "power", name: "USB power", confirmed: true },
      { id: "wires", name: "Jumper wires", confirmed: true },
    ],
    feasibility: {
      status: "missing",
      reasons: [
        "You have the brain and wires. You still need the parts that sense and pump water.",
      ],
      missingParts: [
        {
          id: "sensor",
          name: "Soil moisture sensor",
          reason: "Reads how wet the soil is so your plant gets the water it needs.",
          searchTerms: ["ESP32 soil moisture sensor"],
        },
        {
          id: "pump",
          name: "Mini water pump",
          reason: "Pumps water to your plant when the soil is too dry.",
          searchTerms: ["5V mini water pump ESP32"],
        },
      ],
      alternatives: [
        {
          id: "mood-light",
          title: "Blinking mood light",
          summary: "Make an LED blink to set the mood on your desk.",
          requiredPartIds: ["board", "wires"],
        },
        {
          id: "desk-fan",
          title: "Mini desk fan",
          summary: "Spin a fan and feel the breeze.",
          requiredPartIds: ["board", "wires"],
        },
      ],
    },
    progress: {
      completedRoutes: [
        "/build/new",
        "/build/parts/upload",
        "/build/parts/review",
      ],
    },
  };
}

async function seed(page, state, path) {
  await page.goto("/build/new");
  await page.waitForFunction(() => Boolean(window.MAKEABLE_APP));
  await page.evaluate(async ({ state: next, path: nextPath }) => {
    await window.MAKEABLE_APP.replaceProject({
      ...window.MAKEABLE_APP.getProject(),
      ...structuredClone(next),
    });
    window.MAKEABLE_APP.navigation.navigate(nextPath);
  }, { state, path });
}
