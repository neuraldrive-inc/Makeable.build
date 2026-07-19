import { expect, test } from "@playwright/test";

const baseProject = {
  idea: { text: "Build a self-watering plant" },
  photo: {
    imageId: "source",
    width: 1200,
    height: 800,
    mimeType: "image/jpeg",
    revision: "task-6",
  },
  confirmedParts: [
    {
      id: "board",
      name: "ESP32 DevKit",
      confidence: 0.98,
      confirmed: true,
      bounds: { x: 14, y: 24, width: 34, height: 46 },
    },
    {
      id: "sensor",
      name: "Soil sensor",
      confidence: 0.96,
      confirmed: true,
      bounds: { x: 66, y: 18, width: 18, height: 54 },
    },
  ],
  feasibility: {
    status: "ready",
    projectTitle: "Plant helper",
    summary: "Water a plant when its soil is dry.",
    missingParts: [],
    alternatives: [],
    firmwareSpec: {
      board: "ESP32 DevKit",
      behavior: "Water the plant when the sensor reads dry.",
    },
    diagnostics: {
      tests: [
        { id: "board", name: "Board responds", kind: "board", assemblyStep: 1 },
      ],
      manualAction:
        "Lift the sensor out of the soil, wait 2 seconds, and watch for water.",
      manualQuestion: "Did water reach the plant?",
      manualSuccessLabel: "Yes, it watered the plant",
    },
  },
  wiring: {
    steps: Array.from({ length: 8 }, (_, index) => ({
      order: index + 1,
      title: `Connect wire ${index + 1}`,
      instruction: `Connect the sensor pin ${index + 1}.`,
      from: "Soil sensor",
      to: "ESP32 DevKit",
      fromPartId: "sensor",
      toPartId: "board",
      pin: `SIG ${index + 1} → GPIO ${index + 1}`,
      wireColor: index % 2 ? "yellow" : "black",
      explanation: "This connection carries a safe signal.",
      check: "The board is unplugged while wiring.",
    })),
    currentStep: 0,
    completedSteps: [],
  },
  firmware: {
    sketch: "void setup() {}\\nvoid loop() {}",
    flash: {
      status: "success",
      boardName: "ESP32-S3",
      fqbn: "esp32:esp32:esp32",
    },
  },
  tests: null,
  publish: null,
  progress: {
    completedRoutes: [
      "/build/new",
      "/build/parts/upload",
      "/build/parts/review",
      "/build/feasibility/ready",
      "/build/assemble",
      "/build/code",
    ],
  },
};

test("completed rail stages are semantic navigation and keep labels on mobile", async ({
  page,
}) => {
  await seed(page, baseProject, "/build/test/automatic");
  const describe = page.getByRole("link", { name: /Describe/ });
  const build = page.getByRole("link", { name: /Build \+ Code/ });
  await expect(describe).toHaveAttribute("href", "/build/new");
  await expect(build).toHaveAttribute("href", "/build/code");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(describe).toBeVisible();
  expect(
    await describe.locator(".progress-label").evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).fontSize),
    ),
  ).toBeGreaterThanOrEqual(11);
  await build.click();
  await expect(page).toHaveURL(/\/build\/code$/);
});

test("SPA navigation announces and focuses each new screen", async ({ page }) => {
  await seed(page, baseProject, "/build/test/automatic");
  await page.getByRole("link", { name: /Build \+ Code/ }).click();
  const heading = page.getByRole("heading", {
    name: "Your build is wired. Let’s give it a brain.",
  });
  await expect(heading).toBeFocused();
  await expect(page).toHaveTitle(/Your build is wired. Let’s give it a brain. · Makeable/);
  await expect(page.locator("#appStatus")).toContainText("screen loaded");
  expect((await heading.boundingBox())?.y).toBeGreaterThan(20);
});

test("firmware stays sealed behind the direct ESP32 loading flow", async ({ page }) => {
  await seed(page, baseProject, "/build/code");
  await expect(page.getByRole("heading", { name: "Your board software is ready" })).toBeVisible();
  await expect(page.getByText("No IDE, source-code copy, or download step")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load to my ESP32" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.locator("#firmware-editor, [data-copy-code], [data-download-code]")).toHaveCount(0);
});

test("missing parts exposes a local shop action and alternatives preserve idea history", async ({
  page,
}) => {
  const project = {
    ...baseProject,
    feasibility: {
      ...baseProject.feasibility,
      status: "missing",
      missingParts: [
        {
          id: "pump",
          name: "Mini water pump",
          reason: "Moves water to the plant.",
          searchTerms: ["3V mini water pump"],
          compatibleWith: ["board"],
        },
      ],
      alternatives: [
        {
          id: "soil-alarm",
          title: "Soil alarm",
          summary: "Use the sensor and board to sound an alert.",
          requiredPartIds: ["board", "sensor"],
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
  await page.route("**/api/openai/responses", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "alternative-ready",
        status: "completed",
        output_text: JSON.stringify({
          projectTitle: "Soil alarm",
          summary: "Sound an alert when the soil is dry.",
          feasibility: { status: "ready", reasons: [] },
          missingParts: [],
          alternatives: [],
          wiringSteps: baseProject.wiring.steps.slice(0, 2),
          firmware: {
            language: "Arduino C++",
            sketch:
              "const int OUTPUT_PIN=8; unsigned long outputOffDeadline=0; void reportReset(){Serial.println(\"MAKEABLE|RESET|POWER_ON\");} void reportReady(){Serial.println(\"MAKEABLE|READY|ESP32\");} void reportCheck(){Serial.println(\"MAKEABLE|CHECK|board|PASS|ok\");} void handleCommand(String line){if(line.startsWith(\"MAKEABLE|STOP|\")){digitalWrite(OUTPUT_PIN,LOW);return;} if(line.startsWith(\"MAKEABLE|RUN|\")){unsigned long pulseMs=500;outputOffDeadline=millis()+pulseMs;digitalWrite(OUTPUT_PIN,HIGH);reportCheck();}} void setup(){Serial.begin(115200);reportReset();reportReady();} void loop(){if((long)(millis()-outputOffDeadline)>=0){digitalWrite(OUTPUT_PIN,LOW);}if(Serial.available())handleCommand(Serial.readStringUntil('\\\\n'));}",
            notes: "Keep the board dry.",
          },
          diagnostics: {
            requestId: "alternative-ready",
            warnings: [],
            tests: [
              {
                id: "board",
                name: "Board responds",
                kind: "board",
                assemblyStep: 1,
              },
            ],
            manualAction: "Dry the sensor and listen for the alarm.",
            manualQuestion: "Did the alarm sound?",
            manualSuccessLabel: "Yes, I heard it",
          },
          firmwareSpec: {
            board: "ESP32 DevKit",
            behavior: "Sound an alarm when dry.",
            libraries: [],
            pinAssignments: [],
            serialProtocol: [],
          },
        }),
      }),
    }),
  );
  await seed(page, project, "/build/feasibility/missing");

  const shop = page.getByRole("button", { name: "Shop missing parts" });
  await shop.click();
  await expect(page.getByText(/shopping list is ready/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Search for Mini water pump" })).toBeFocused();

  await page.getByRole("button", { name: /Start Soil alarm/ }).click();
  await expect(page).toHaveURL(/\/build\/feasibility\/ready$/);
  const idea = await page.evaluate(() => window.MAKEABLE_APP.getProject().idea);
  expect(idea.text).toBe("Soil alarm");
  expect(idea.history.at(-1).text).toBe("Build a self-watering plant");
});

test("obtaining the final missing part regenerates wiring and firmware before continuing", async ({
  page,
}) => {
  const project = {
    ...baseProject,
    feasibility: {
      ...baseProject.feasibility,
      status: "missing",
      reasons: ["A motor is required to create airflow."],
      missingParts: [
        {
          id: "motor",
          name: "Small DC motor",
          reason: "Creates airflow.",
          searchTerms: ["3V DC motor"],
          compatibleWith: ["board"],
        },
      ],
      alternatives: [
        {
          id: "sensor-display",
          title: "Sensor display",
          summary: "Show the sensor reading without the pump.",
          requiredPartIds: ["board", "sensor"],
        },
      ],
    },
    wiring: { steps: [{ title: "Stale wiring" }] },
    firmware: { sketch: "stale firmware" },
    progress: {
      completedRoutes: [
        "/build/new",
        "/build/parts/upload",
        "/build/parts/review",
      ],
    },
  };
  let requestPayload;
  await page.route("**/api/openai/responses", async (route) => {
    requestPayload = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 150));
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "regenerated-ready",
        output_text: JSON.stringify({
          projectTitle: "Mini fan",
          summary: "Run a small motor when motion is detected.",
          parts: [],
          feasibility: { status: "ready", reasons: [] },
          missingParts: [],
          alternatives: [],
          wiringSteps: baseProject.wiring.steps.slice(0, 2),
          firmwareSpec: {
            board: "ESP32 DevKit",
            behavior: "Run the fan when motion is detected.",
            libraries: [],
            pinAssignments: [],
            serialProtocol: [],
          },
          firmware: {
            language: "Arduino C++",
            sketch:
              "const int MOTOR_PIN=8; unsigned long motorOffDeadline=0; void reportReset(){Serial.println(\"MAKEABLE|RESET|POWER_ON\");} void reportReady(){Serial.println(\"MAKEABLE|READY|ESP32\");} void reportCheck(){Serial.println(\"MAKEABLE|CHECK|motor|PASS|ok\");} void handleCommand(String line){if(line.startsWith(\"MAKEABLE|STOP|\")){digitalWrite(MOTOR_PIN,LOW);return;} if(line.startsWith(\"MAKEABLE|RUN|\")){unsigned long pulseMs=500;motorOffDeadline=millis()+pulseMs;digitalWrite(MOTOR_PIN,HIGH);reportCheck();}} void setup(){Serial.begin(115200);reportReset();reportReady();} void loop(){if((long)(millis()-motorOffDeadline)>=0){digitalWrite(MOTOR_PIN,LOW);}if(Serial.available())handleCommand(Serial.readStringUntil('\\\\n'));}",
            notes: "Use a transistor driver for the motor.",
          },
          diagnostics: {
            warnings: [],
            tests: [
              {
                id: "motor",
                name: "Motor spins",
                kind: "actuator",
                pulseMs: 500,
                assemblyStep: 2,
              },
            ],
            manualAction: "Move in front of the PIR sensor.",
            manualQuestion: "Did the fan spin?",
            manualSuccessLabel: "Yes, the fan spun",
          },
        }),
      }),
    });
  });
  await seed(page, project, "/build/feasibility/missing");

  await page
    .getByRole("button", { name: "Mark Small DC motor as obtained" })
    .click();
  await expect(
    page.getByRole("button", { name: "Start Sensor display" }),
  ).toBeDisabled();

  await expect(page).toHaveURL(/\/build\/feasibility\/ready$/);
  expect(JSON.stringify(requestPayload)).toContain("Small DC motor");
  const regenerated = await page.evaluate(() => window.MAKEABLE_APP.getProject());
  expect(regenerated.wiring.steps[0].title).not.toBe("Stale wiring");
  expect(regenerated.firmware.sketch).not.toBe("stale firmware");
});

test("desktop camera entry opens a live preview and shutter with file fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 360;
          return canvas.captureStream();
        },
      },
    });
  });
  await seed(page, baseProject, "/build/parts/upload");
  await page.getByRole("button", { name: "Use camera instead" }).click();
  await expect(page.getByRole("dialog", { name: "Photograph your parts" })).toBeVisible();
  await expect(page.locator("[data-upload-camera-preview]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await expect(page.getByLabel("Choose a camera photo")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Photograph your parts" })).toBeHidden();
  expect(
    await page.evaluate(() =>
      window.MAKEABLE_APP
        ? document.querySelector("[data-upload-camera-preview]")?.srcObject
        : null,
    ),
  ).toBeNull();
});

test("assembly shows a real canvas path, pin labels, mobile legend, and all eight steps", async ({
  page,
}) => {
  await seed(page, baseProject, "/build/assemble");
  await expect(page.locator("[data-wire-path]")).toBeVisible();
  await expect(page.locator(".connection-annotation--from em")).toHaveText(
    "From pin: SIG 1",
  );
  await expect(page.locator(".connection-annotation--to em")).toHaveText(
    "To pin: GPIO 1",
  );
  await page.getByRole("button", { name: "Watch this move." }).click();
  await expect(page.getByRole("button", { name: "Watch this move." })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".connection-legend")).toBeVisible();
  const progress = page.locator(".connection-progress");
  const widths = await progress.evaluate((node) => ({
    client: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  await expect(page.getByRole("button", { name: "Connection 8" })).toBeVisible();
});

test("automatic Start and Stop are mutually exclusive", async ({ page }) => {
  await page.addInitScript(() => {
    window.MAKEABLE_HARDWARE = {
      async createDiagnosticSession() {
        return new Promise(() => {});
      },
    };
  });
  await seed(page, baseProject, "/build/test/automatic");
  const start = page.getByRole("button", { name: "Start automatic check" });
  const stop = page.getByRole("button", { name: "Stop test" });
  await expect(start).toBeVisible();
  await expect(stop).toBeHidden();
  await start.click();
  await expect(start).toBeHidden();
  await expect(stop).toBeVisible();
});

test("manual test uses instructional media and only reveals live capture controls in camera mode", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 360;
          return canvas.captureStream();
        },
      },
    });
  });
  const project = {
    ...baseProject,
    tests: {
      automatic: {
        status: "pass",
        checks: [{ id: "board", status: "pass" }],
      },
    },
    progress: {
      completedRoutes: [
        ...baseProject.progress.completedRoutes,
        "/build/test/automatic",
      ],
    },
  };
  await seed(page, project, "/build/test/manual");
  await expect(page.locator(".manual-instruction-media")).toHaveCount(3);
  await expect(page.locator("[data-camera-preview]")).toBeHidden();
  await expect(page.getByRole("button", { name: "Capture evidence" })).toBeHidden();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.locator("[data-camera-preview]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture evidence" })).toBeVisible();
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
