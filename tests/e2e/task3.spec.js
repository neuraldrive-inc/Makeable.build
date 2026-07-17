import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const photoPath = path.join(root, "test image.jpg");
const visualOutput = path.join(root, "test-results", "task3-visual");

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
    sketch: "void setup() {}",
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
  await page.getByLabel("Add a sketch").setInputFiles(photoPath);
  await expect(page.getByText("Sketch attached")).toBeVisible();
  const voiceTrigger = page.getByRole("button", { name: "Describe with your voice" });
  await expect(voiceTrigger).toHaveText("Tell us like you’d tell a friend.");
  await voiceTrigger.click();
  await expect(page.getByText("Listening…")).toBeVisible();
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
  await page.getByLabel("Part name").fill("DC motor");
  await page.getByLabel("Left edge").fill("64");
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
  await expect(page.getByText("Obtained")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Obtained")).toBeVisible();
  const persisted = await page.evaluate(() => window.MAKEABLE_APP.getProject());
  expect(persisted.confirmedParts.find(({ id }) => id === "motor")).toMatchObject({
    name: "DC motor",
    confirmed: true,
    bounds: { x: 64 },
  });
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
