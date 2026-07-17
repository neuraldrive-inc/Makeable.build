import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const photoPath = path.join(root, "test image.jpg");
const visualOutput = path.join(root, "test-results", "task3-visual");
const contractSketch = `
const int PUMP_PIN = 8;
bool pumpActive = false;
unsigned long pumpOffDeadline = 0;
void stopPump() { digitalWrite(PUMP_PIN, LOW); pumpActive = false; }
void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }
void reportCheck() { Serial.println("MAKEABLE|CHECK|motor|PASS|value=1"); }
void handleCommand(String line) {
  if (line.startsWith("MAKEABLE|STOP|")) { stopPump(); return; }
  if (line.startsWith("MAKEABLE|RUN|")) {
    unsigned long pulseMs = 500;
    digitalWrite(PUMP_PIN, HIGH);
    pumpActive = true;
    pumpOffDeadline = millis() + pulseMs;
    reportCheck();
  }
}
void setup() { Serial.begin(115200); reportReset(); reportReady(); }
void loop() {
  if (pumpActive && (long)(millis() - pumpOffDeadline) >= 0) stopPump();
  if (Serial.available()) handleCommand(Serial.readStringUntil('\\n'));
}
`;

const scanPlan = {
  projectTitle: "Mini desk fan",
  summary: "Spin a small fan on the desk.",
  parts: [
    {
      id: "board",
      name: "Arduino Uno",
      type: "controller",
      role: "Controller",
      confidence: 0.98,
      bounds: { x: 35, y: 25, width: 28, height: 42 },
    },
    {
      id: "motor",
      name: "Possible DC motor",
      type: "motor",
      role: "Output",
      confidence: 0.56,
      bounds: { x: 67, y: 18, width: 18, height: 25 },
    },
  ],
  feasibility: { status: "missing", reasons: ["A fan blade is still needed."] },
  missingParts: [],
  alternatives: [],
  wiringSteps: [],
  diagnostics: { requestId: "scan_1", warnings: [] },
  firmwareSpec: {
    board: "Arduino Uno",
    behavior: "Spin the motor",
    libraries: [],
    pinAssignments: [],
    serialProtocol: [],
  },
};

const confirmedPlan = {
  ...scanPlan,
  parts: undefined,
  feasibility: { status: "missing", reasons: ["A fan blade is still needed."] },
  missingParts: [
    {
      id: "fan-blade",
      name: "Fan blade",
      reason: "Fits the motor shaft and moves air.",
      searchTerms: ["2mm shaft fan blade", "3V hobby motor"],
      compatibleWith: ["motor"],
    },
  ],
  alternatives: [
    {
      id: "spinner",
      title: "Paper spinner",
      summary: "Make a colorful spinner with the same motor.",
      requiredPartIds: ["board", "motor"],
    },
    {
      id: "plant",
      title: "Plant helper",
      summary: "Needs a soil sensor.",
      requiredPartIds: ["board", "soil-sensor"],
    },
  ],
  wiringSteps: [
    {
      order: 1,
      title: "Connect the motor",
      instruction: "Connect the motor through a driver.",
      from: "Arduino Uno",
      to: "DC motor",
      fromPartId: "board",
      toPartId: "motor",
      pin: "D9",
      wireColor: "blue",
      check: "Motor is off before power.",
    },
  ],
  firmware: {
    language: "Arduino C++",
    sketch: contractSketch,
    notes: "Use a motor driver.",
  },
  diagnostics: { requestId: "confirmed_1", warnings: [] },
};

async function mockPlanning(page) {
  await page.route("**/api/openai/responses", async (route) => {
    const body = route.request().postDataJSON();
    const isConfirmation = JSON.stringify(body).includes("confirmed inventory");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: isConfirmation ? "resp_confirmed_1" : "resp_scan_1",
        status: "completed",
        output_text: JSON.stringify(isConfirmation ? confirmedPlan : scanPlan),
      }),
    });
  });
}

async function completeIdea(page) {
  await page.goto("/build/new");
  await page.getByLabel("Describe your idea").fill("Make a mini desk fan");
  await page.getByRole("button", { name: "Start my build" }).click();
  await expect(page).toHaveURL(/\/build\/parts\/upload$/);
}

test("describe examples, sketch input, and secure voice subtitle are operational", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    class Recorder {
      static isTypeSupported() {
        return true;
      }
      constructor() {}
      start() {}
      stop() {}
    }
    class Socket {
      static OPEN = 1;
      constructor() {
        this.readyState = 1;
        setTimeout(() => this.onopen?.(), 0);
      }
      send() {}
      close() {}
    }
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
        }),
      },
    });
    window.MediaRecorder = Recorder;
    window.WebSocket = Socket;
  });
  await page.route("**/api/deepgram/token", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ access_token: "short-lived", expires_in: 60 }),
    });
  });
  await page.goto("/build/new");

  await expect(
    page.getByRole("heading", { level: 1, name: "What do you want to make?" }),
  ).toBeVisible();
  if (process.env.MAKEABLE_VISUAL && testInfo.project.name === "desktop") {
    mkdirSync(visualOutput, { recursive: true });
    await page.screenshot({
      path: path.join(visualOutput, "describe-1440x1024.png"),
    });
  }
  await page.getByRole("button", { name: "A mini fan" }).click();
  await expect(page.getByLabel("Describe your idea")).toHaveValue(/mini fan/i);
  await expectFileControlFocus(page, "Add a sketch");
  await page.getByLabel("Add a sketch").setInputFiles(photoPath);
  await expect(page.getByText("Sketch attached")).toBeVisible();
  const voiceTrigger = page.getByRole("button", { name: "Describe with your voice" });
  await expect(voiceTrigger).toHaveText("Tell us like you’d tell a friend.");
  await voiceTrigger.click();
  await expect(page.getByText("Listening…")).toBeVisible();
});

test("accepting a new photo plan clears prior review selection", async ({ page }) => {
  await mockPlanning(page);
  await completeIdea(page);
  await page.evaluate(async () => {
    await window.MAKEABLE_APP.updateProject("review", {
      selectedPartId: "board",
    });
  });

  await page.getByLabel("Upload my parts").setInputFiles(photoPath);

  await expect(page).toHaveURL(/\/build\/parts\/review$/);
  await expect(page.getByLabel("Part name")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.MAKEABLE_APP.getProject().review),
  ).toEqual({ selectedPartId: null });
});

test("upload, persistent annotation review, confirmation, and missing-part actions work", async ({
  page,
}, testInfo) => {
  await mockPlanning(page);
  await completeIdea(page);
  if (process.env.MAKEABLE_VISUAL && testInfo.project.name === "desktop") {
    mkdirSync(visualOutput, { recursive: true });
    await page.screenshot({
      path: path.join(visualOutput, "upload-1440x1024.png"),
    });
  }
  await expectFileControlFocus(page, "Upload my parts");
  const cameraButton = page.getByRole("button", { name: "Use camera instead" });
  await cameraButton.focus();
  await expect(cameraButton).toBeFocused();

  await page.getByLabel("Upload my parts").setInputFiles(photoPath);
  await expect(page).toHaveURL(/\/build\/parts\/review$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Let’s name what’s on your desk." }),
  ).toBeVisible();
  if (process.env.MAKEABLE_VISUAL && testInfo.project.name === "desktop") {
    await page.screenshot({
      path: path.join(visualOutput, "review-1440x1024.png"),
    });
  }
  await page.getByRole("button", { name: /Possible DC motor annotation/ }).click();
  await expect(page.getByLabel("Part name")).toHaveValue("Possible DC motor");
  expect(
    await page.evaluate(
      () => window.MAKEABLE_APP.getProject().review?.selectedPartId,
    ),
  ).toBe("motor");
  await page.reload();
  await expect(page.getByLabel("Part name")).toHaveValue("Possible DC motor");
  await page.getByLabel("Part name").fill("DC motor");
  await page.getByLabel("Part name").press("Tab");
  await expect(page.locator(".part-chip").getByText("DC motor")).toBeVisible();
  await page.getByLabel("Left edge").fill("92");
  await page.getByLabel("Left edge").press("Tab");
  await expect(page.getByLabel("Width")).toHaveValue("8");
  await expect(
    page.locator('.part-annotation[data-select-part="motor"]'),
  ).toHaveAttribute("style", /left:92%;top:18%;width:8%;height:25%/);
  await page.getByLabel("Confirm DC motor despite low confidence").check();
  await page.getByRole("button", { name: "Confirm my parts" }).click();

  await expect(page).toHaveURL(/\/build\/feasibility\/missing$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Almost! You’re missing 1 part." }),
  ).toBeVisible();
  const search = page.getByRole("link", { name: "Search for Fan blade" });
  await expect(search).toHaveAttribute("href", /google\.com\/search/);
  await expect(page.getByRole("heading", { name: "Paper spinner" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plant helper" })).toHaveCount(0);
  if (process.env.MAKEABLE_VISUAL && testInfo.project.name === "desktop") {
    await page.screenshot({
      path: path.join(visualOutput, "missing-1440x1024.png"),
    });
  }
  await page.getByRole("button", { name: "Mark Fan blade as obtained" }).click();
  await expect(page).toHaveURL(/\/build\/feasibility\/ready$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Yep — you can build it!" }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Confirmed parts" }).getByText("Fan blade"),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/build\/feasibility\/ready$/);
  const persisted = await page.evaluate(() => window.MAKEABLE_APP.getProject());
  expect(persisted.confirmedParts.find(({ id }) => id === "motor")).toMatchObject({
    name: "DC motor",
    confirmed: true,
    bounds: { x: 92, width: 8 },
  });
  expect(persisted.confirmedParts.find(({ id }) => id === "fan-blade")).toMatchObject({
    name: "Fan blade",
    confirmed: true,
  });
  expect(persisted.feasibility).toMatchObject({
    status: "ready",
    missingParts: [],
  });
  expect(persisted.wiring.steps).toHaveLength(1);
  expect(persisted.firmware.sketch.trim()).toBe(contractSketch.trim());
});

test("annotations follow the contained image content for wide and tall photos", async ({
  page,
}) => {
  await page.goto("/build/new");
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 500;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f7f0e4";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const photo = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    await window.MAKEABLE_APP.saveImage("source", photo);
    await window.MAKEABLE_APP.replaceProject({
      ...window.MAKEABLE_APP.getProject(),
      idea: { text: "Make a mini desk fan" },
      photo: {
        imageId: "source",
        width: 2000,
        height: 500,
        mimeType: "image/jpeg",
        revision: "wide-photo",
      },
      confirmedParts: [
        {
          id: "board",
          name: "Arduino Uno",
          confidence: 0.98,
          lowConfidence: false,
          confirmed: true,
          bounds: { x: 25, y: 20, width: 50, height: 60 },
        },
      ],
      review: { selectedPartId: null },
      progress: {
        completedRoutes: ["/build/new", "/build/parts/upload"],
      },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/parts/review");
  });
  await page.waitForFunction(
    () => document.querySelector("[data-source-photo]")?.naturalWidth === 2000,
  );

  const frame = await page.evaluate(() => {
    const image = document.querySelector("[data-source-photo]");
    const layer = document.querySelector(".annotation-layer");
    const imageRect = image.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const expectedWidth = Math.min(
      imageRect.width,
      imageRect.height * (image.naturalWidth / image.naturalHeight),
    );
    const expectedHeight = expectedWidth / (image.naturalWidth / image.naturalHeight);
    return {
      actual: {
        left: layerRect.left,
        top: layerRect.top,
        width: layerRect.width,
        height: layerRect.height,
      },
      expected: {
        left: imageRect.left + (imageRect.width - expectedWidth) / 2,
        top: imageRect.top + (imageRect.height - expectedHeight) / 2,
        width: expectedWidth,
        height: expectedHeight,
      },
    };
  });

  for (const field of ["left", "top", "width", "height"]) {
    expect(
      Math.abs(frame.actual[field] - frame.expected[field]),
      `${field} should match contained image content`,
    ).toBeLessThanOrEqual(1.5);
  }
});

test("review selection and normalized edits survive a direct reload", async ({ page }) => {
  await page.goto("/build/new");
  await page.waitForFunction(() => Boolean(window.MAKEABLE_APP));
  await page.evaluate(async () => {
    await window.MAKEABLE_APP.replaceProject({
      ...window.MAKEABLE_APP.getProject(),
      idea: { text: "Make a mini desk fan" },
      photo: {
        imageId: "source",
        width: 1200,
        height: 800,
        mimeType: "image/jpeg",
        revision: "review-edit",
      },
      confirmedParts: [
        {
          id: "motor",
          name: "Possible DC motor",
          type: "motor",
          role: "Output",
          confidence: 0.56,
          lowConfidence: true,
          confirmed: false,
          bounds: { x: 67, y: 18, width: 18, height: 25 },
        },
      ],
      review: { selectedPartId: null },
      feasibility: { status: "ready", missingParts: [], alternatives: [] },
      wiring: { steps: [{ title: "Preserve me" }] },
      firmware: { sketch: "void setup() {}" },
      progress: {
        completedRoutes: ["/build/new", "/build/parts/upload"],
      },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/parts/review");
  });

  await page.getByRole("button", { name: /Possible DC motor annotation/ }).click();
  await expect(page.getByLabel("Part name")).toHaveValue("Possible DC motor");
  await page.reload();
  await expect(page.getByLabel("Part name")).toHaveValue("Possible DC motor");
  const selectedProject = await page.evaluate(() => window.MAKEABLE_APP.getProject());
  expect(selectedProject.review).toEqual({ selectedPartId: "motor" });
  expect(selectedProject.wiring.steps).toEqual([{ title: "Preserve me" }]);
  expect(selectedProject.firmware.sketch).toBe("void setup() {}");
  await page.getByLabel("Part name").fill("DC motor");
  await page.getByLabel("Part name").press("Tab");
  await expect(page.locator(".part-chip").getByText("DC motor")).toBeVisible();
  await page.getByLabel("Left edge").fill("92");
  await page.getByLabel("Left edge").press("Tab");
  await expect(page.getByLabel("Width")).toHaveValue("8");
  await expect(
    page.locator('.part-annotation[data-select-part="motor"]'),
  ).toHaveAttribute("style", /left:92%;top:18%;width:8%;height:25%/);

  const persisted = await page.evaluate(() => window.MAKEABLE_APP.getProject());
  expect(persisted.review).toEqual({ selectedPartId: "motor" });
});

test("obtaining the final required part transitions Missing to Ready", async ({ page }) => {
  await page.goto("/build/new");
  await page.waitForFunction(() => Boolean(window.MAKEABLE_APP));
  await page.evaluate(async () => {
    await window.MAKEABLE_APP.replaceProject({
      ...window.MAKEABLE_APP.getProject(),
      idea: { text: "Make a mini desk fan" },
      photo: {
        imageId: "source",
        width: 1200,
        height: 800,
        mimeType: "image/jpeg",
        revision: "missing-acquisition",
      },
      confirmedParts: [{ id: "motor", name: "DC motor", confirmed: true }],
      feasibility: {
        status: "missing",
        reasons: ["A fan blade is still needed."],
        missingParts: [
          {
            id: "fan-blade",
            name: "Fan blade",
            reason: "Moves air.",
            compatibleWith: ["motor"],
            obtained: false,
          },
        ],
        alternatives: [],
      },
      wiring: { steps: [{ title: "Preserve me" }] },
      firmware: { sketch: "void setup() {}" },
      progress: {
        completedRoutes: [
          "/build/new",
          "/build/parts/upload",
          "/build/parts/review",
        ],
      },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/feasibility/missing");
  });

  await page.getByRole("button", { name: "Mark Fan blade as obtained" }).click();
  await expect(page).toHaveURL(/\/build\/feasibility\/ready$/);
  await expect(
    page.getByRole("list", { name: "Confirmed parts" }).getByText("Fan blade"),
  ).toBeVisible();
  const persisted = await page.evaluate(() => window.MAKEABLE_APP.getProject());
  expect(persisted.feasibility.status).toBe("ready");
  expect(persisted.feasibility.missingParts).toEqual([]);
  expect(persisted.wiring.steps).toEqual([{ title: "Preserve me" }]);
  expect(persisted.firmware.sketch).toBe("void setup() {}");
});

test("replaced and torn-down photo object URLs are revoked", async ({ page }) => {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    window.__makeableObjectUrls = { created: [], revoked: [] };
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      window.__makeableObjectUrls.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.__makeableObjectUrls.revoked.push(url);
      revoke(url);
    };
  });
  await page.goto("/build/new");
  await page.evaluate(async () => {
    const photo = await fetch("/test%20image.jpg").then((response) => response.blob());
    await window.MAKEABLE_APP.saveImage("source", photo);
    await window.MAKEABLE_APP.replaceProject({
      ...window.MAKEABLE_APP.getProject(),
      idea: { text: "Make a mini desk fan" },
      photo: {
        imageId: "source",
        width: 1200,
        height: 800,
        mimeType: "image/jpeg",
        revision: "first",
      },
      confirmedParts: [
        {
          id: "board",
          name: "Arduino Uno",
          confidence: 0.98,
          confirmed: true,
          bounds: { x: 35, y: 25, width: 28, height: 42 },
        },
      ],
      progress: {
        completedRoutes: ["/build/new", "/build/parts/upload"],
      },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/parts/review");
  });
  await expect(page.getByAltText("Your uploaded parts")).toHaveAttribute("src", /^blob:/);

  await page.evaluate(async () => {
    const photo = await fetch("/test%20image.jpg").then((response) => response.blob());
    await window.MAKEABLE_APP.saveImage("source", photo);
    await window.MAKEABLE_APP.replaceProject({
      ...window.MAKEABLE_APP.getProject(),
      photo: {
        ...window.MAKEABLE_APP.getProject().photo,
        revision: "second",
      },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/parts/upload");
    window.MAKEABLE_APP.navigation.navigate("/build/parts/review");
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__makeableObjectUrls.revoked.length),
    )
    .toBe(1);

  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect
    .poll(() =>
      page.evaluate(() => window.__makeableObjectUrls.revoked.length),
    )
    .toBe(2);
});

test("ready feasibility renders the uploaded photo and confirmed inventory", async ({
  page,
}, testInfo) => {
  await page.goto("/build/new");
  await page.evaluate(async () => {
    const photo = await fetch("/test%20image.jpg").then((response) => response.blob());
    await window.MAKEABLE_APP.saveImage(
      "source",
      photo,
    );
    await window.MAKEABLE_APP.replaceProject({
      ...window.MAKEABLE_APP.getProject(),
      idea: { text: "Make a mini desk fan" },
      photo: { imageId: "source", width: 1200, height: 800, mimeType: "image/jpeg" },
      confirmedParts: [
        {
          id: "board",
          name: "Arduino Uno",
          confidence: 0.98,
          confirmed: true,
          bounds: { x: 35, y: 25, width: 28, height: 42 },
        },
      ],
      feasibility: {
        status: "ready",
        reasons: [],
        missingParts: [],
        alternatives: [],
      },
      wiring: { steps: [{ title: "Connect the board" }] },
      firmware: { sketch: "void setup() {}" },
      progress: {
        completedRoutes: [
          "/build/new",
          "/build/parts/upload",
          "/build/parts/review",
        ],
      },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/feasibility/ready");
  });

  await expect(page).toHaveURL(/\/build\/feasibility\/ready$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Yep — you can build it!" }),
  ).toBeVisible();
  await expect(page.getByAltText("Your uploaded parts")).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Confirmed parts" })
      .getByText("Arduino Uno", { exact: true }),
  ).toBeVisible();
  if (process.env.MAKEABLE_VISUAL && testInfo.project.name === "desktop") {
    mkdirSync(visualOutput, { recursive: true });
    await page.screenshot({
      path: path.join(visualOutput, "ready-1440x1024.png"),
    });
  }
});

test("Task 3 routes are accessible and stay within desktop, tablet, and mobile widths", async ({
  page,
}) => {
  await page.goto("/build/new");
  await expectAccessibleAndContained(page, "Describe");

  const sharedProject = {
    id: "current",
    schemaVersion: 1,
    updatedAt: "2026-07-16T12:00:00.000Z",
    idea: { text: "Make a mini desk fan" },
    photo: { imageId: "source", width: 1200, height: 800, mimeType: "image/jpeg" },
    confirmedParts: [
      {
        id: "board",
        name: "Arduino Uno",
        confidence: 0.98,
        lowConfidence: false,
        confirmed: true,
        bounds: { x: 35, y: 25, width: 28, height: 42 },
      },
    ],
    feasibility: null,
    wiring: null,
    firmware: null,
    tests: null,
    publish: null,
  };

  await page.evaluate(async (project) => {
    await window.MAKEABLE_APP.replaceProject({
      ...project,
      progress: { completedRoutes: ["/build/new"] },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/parts/upload");
  }, sharedProject);
  await expectAccessibleAndContained(page, "Upload Parts");

  await page.evaluate(async (project) => {
    await window.MAKEABLE_APP.replaceProject({
      ...project,
      progress: {
        completedRoutes: ["/build/new", "/build/parts/upload"],
      },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/parts/review");
  }, sharedProject);
  await expectAccessibleAndContained(page, "Review Parts");

  await page.evaluate(async (project) => {
    await window.MAKEABLE_APP.replaceProject({
      ...project,
      feasibility: {
        status: "ready",
        reasons: [],
        missingParts: [],
        alternatives: [],
      },
      wiring: { steps: [] },
      firmware: { sketch: "void setup() {}" },
      progress: {
        completedRoutes: [
          "/build/new",
          "/build/parts/upload",
          "/build/parts/review",
        ],
      },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/feasibility/ready");
  }, sharedProject);
  await expectAccessibleAndContained(page, "Ready");

  await page.evaluate(async (project) => {
    await window.MAKEABLE_APP.replaceProject({
      ...project,
      feasibility: {
        status: "missing",
        reasons: ["A fan blade is still needed."],
        missingParts: [
          {
            id: "fan-blade",
            name: "Fan blade",
            reason: "Moves air.",
            searchTerms: ["2mm shaft"],
            compatibleWith: ["board"],
            obtained: false,
          },
        ],
        alternatives: [],
      },
      progress: {
        completedRoutes: [
          "/build/new",
          "/build/parts/upload",
          "/build/parts/review",
        ],
      },
    });
    window.MAKEABLE_APP.navigation.navigate("/build/feasibility/missing");
  }, sharedProject);
  await expectAccessibleAndContained(page, "Missing Parts");
});

async function expectAccessibleAndContained(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(({ impact }) =>
    ["serious", "critical"].includes(impact),
  );
  expect(blocking, `${label} accessibility`).toEqual([]);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `${label} horizontal overflow`,
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectFileControlFocus(page, label) {
  const input = page.getByLabel(label);
  await input.focus();
  await expect(input).toBeFocused();
  const focusIndicator = await input.evaluate((element) => {
    const visibleControl = element.labels?.[0];
    const style = visibleControl ? getComputedStyle(visibleControl) : null;
    return {
      outlineStyle: style?.outlineStyle || "none",
      outlineWidth: Number.parseFloat(style?.outlineWidth || "0"),
    };
  });
  expect(focusIndicator.outlineStyle).not.toBe("none");
  expect(focusIndicator.outlineWidth).toBeGreaterThanOrEqual(2);
}
