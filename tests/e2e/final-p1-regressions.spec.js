import { expect, test } from "@playwright/test";

const compliantSketch = `
const int PUMP_PIN = 8;
unsigned long pumpOffDeadline = 0;
void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }
void reportCheck() { Serial.println("MAKEABLE|CHECK|pump|PASS|pulse complete"); }
void handleCommand(String line) {
  if (line.startsWith("MAKEABLE|STOP|")) {
    digitalWrite(PUMP_PIN, LOW);
    return;
  }
  if (line.startsWith("MAKEABLE|RUN|")) {
    unsigned long pulseMs = 500;
    pumpOffDeadline = millis() + pulseMs;
    digitalWrite(PUMP_PIN, HIGH);
    reportCheck();
  }
}
void setup() { Serial.begin(115200); reportReset(); reportReady(); }
void loop() {
  if ((long)(millis() - pumpOffDeadline) >= 0) {
    digitalWrite(PUMP_PIN, LOW);
  }
  if (Serial.available()) handleCommand(Serial.readStringUntil('\\n'));
}
`;

const scanPlan = {
  projectTitle: "Desk helper",
  summary: "A small useful build.",
  parts: [
    {
      id: "board",
      name: "ESP32",
      type: "controller",
      role: "Controller",
      confidence: 0.98,
      bounds: { x: 12, y: 16, width: 32, height: 42 },
    },
    {
      id: "pump",
      name: "Possible pump",
      type: "actuator",
      role: "Output",
      confidence: 0.61,
      bounds: { x: 58, y: 20, width: 24, height: 32 },
    },
  ],
  feasibility: { status: "ready", reasons: ["The confirmed parts are compatible."] },
  missingParts: [],
  alternatives: [],
  wiringSteps: [],
  diagnostics: { requestId: "scan-final-p1", warnings: [] },
  firmwareSpec: {
    board: "ESP32",
    behavior: "Run the output safely.",
    libraries: [],
    pinAssignments: [],
    serialProtocol: [],
  },
};

const confirmedPlan = {
  ...scanPlan,
  parts: undefined,
  wiringSteps: [
    {
      order: 1,
      title: "Connect the pump",
      instruction: "Connect the pump through its driver.",
      explanation: "The driver protects the controller pin.",
      from: "ESP32",
      to: "Pump",
      fromPartId: "board",
      toPartId: "pump",
      pin: "GPIO 8",
      wireColor: "blue",
      check: "The pump remains dry and off.",
    },
  ],
  firmware: {
    language: "Arduino C++",
    sketch: compliantSketch,
    notes: "Short diagnostic pulses only.",
  },
  diagnostics: {
    requestId: "confirm-final-p1",
    warnings: [],
    tests: [
      {
        id: "pump",
        name: "Pump spins",
        kind: "actuator",
        pulseMs: 500,
        assemblyStep: 1,
      },
    ],
  },
};

test("a late confirmation response cannot overwrite edits made while it is pending", async ({
  page,
}) => {
  let releaseConfirmation;
  const confirmationGate = new Promise((resolve) => {
    releaseConfirmation = resolve;
  });
  await page.route("**/api/openai/responses", async (route) => {
    const confirmation = JSON.stringify(route.request().postDataJSON()).includes(
      "confirmed inventory",
    );
    if (confirmation) await confirmationGate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: confirmation ? "confirm-final-p1" : "scan-final-p1",
        status: "completed",
        output_text: JSON.stringify(confirmation ? confirmedPlan : scanPlan),
      }),
    });
  });

  await openUpload(page);
  await dropCanvasPhoto(page, "#d84b75", "review-source.jpg");
  await expect(page).toHaveURL(/\/build\/parts\/review$/);
  await page
    .getByRole("button", { name: /Possible pump annotation/ })
    .click();
  await page
    .getByLabel("Confirm Possible pump despite low confidence")
    .check();
  await page.getByRole("button", { name: "Confirm my parts" }).click();
  await expect(page.getByText("Regenerating your guide and firmware…")).toBeVisible();

  await page.getByLabel("Part name").fill("Edited pump");
  await page.getByLabel("Part name").press("Tab");
  await expect(page.locator(".part-chip").getByText("Edited pump")).toBeVisible();
  releaseConfirmation();

  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/\/build\/parts\/review$/);
  await expect(page.getByLabel("Part name")).toHaveValue("Edited pump");
  expect(
    await page.evaluate(() =>
      window.MAKEABLE_APP.getProject().confirmedParts.find(
        ({ id }) => id === "pump",
      ),
    ),
  ).toMatchObject({ name: "Edited pump", confirmed: true });
});

test("concurrent photo drops commit matching metadata and blob from the latest request", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalTransaction = IDBDatabase.prototype.transaction;
    window.__makeableImageWrites = 0;
    IDBDatabase.prototype.transaction = function patchedTransaction(
      storeNames,
      mode,
      options,
    ) {
      const transaction = originalTransaction.call(this, storeNames, mode, options);
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      if (!names.includes("images") || mode !== "readwrite") return transaction;
      const writeNumber = ++window.__makeableImageWrites;
      if (writeNumber !== 1) return transaction;
      return new Proxy(transaction, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, property, value) {
          if (property === "oncomplete") {
            target.oncomplete = (event) => window.setTimeout(() => value(event), 1500);
            return true;
          }
          return Reflect.set(target, property, value, target);
        },
      });
    };
  });
  await page.route("**/api/openai/responses", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "latest-scan",
        status: "completed",
        output_text: JSON.stringify(scanPlan),
      }),
    });
  });

  await openUpload(page);
  await dropCanvasPhoto(page, "#ec5a65", "first-photo.jpg");
  await page.waitForFunction(() => window.__makeableImageWrites === 1);
  await dropCanvasPhoto(page, "#377be8", "latest-photo.jpg");

  await expect(page).toHaveURL(/\/build\/parts\/review$/);
  await page.waitForTimeout(1700);
  const projectPhoto = await page.evaluate(
    () => window.MAKEABLE_APP.getProject().photo,
  );
  expect(projectPhoto.originalName).toBe("latest-photo.jpg");
  expect(
    await page.evaluate(async () => {
      const blob = await window.MAKEABLE_APP.loadImage("source");
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0, 1, 1);
      bitmap.close();
      return [...context.getImageData(0, 0, 1, 1).data];
    }),
  ).toEqual(expect.arrayContaining([expect.any(Number)]));
  const [red, , blue] = await page.evaluate(async () => {
    const blob = await window.MAKEABLE_APP.loadImage("source");
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, 1, 1);
    bitmap.close();
    return [...context.getImageData(0, 0, 1, 1).data];
  });
  expect(blue).toBeGreaterThan(red);
});

async function openUpload(page) {
  await page.goto("/build/new");
  await page.getByLabel("Describe your idea").fill("Make a desk helper");
  await page.getByRole("button", { name: "Start my build" }).click();
  await expect(page).toHaveURL(/\/build\/parts\/upload$/);
}

async function dropCanvasPhoto(page, color, name) {
  await page.locator("[data-upload-zone]").evaluate(
    async (zone, { fill, fileName }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 32;
      const context = canvas.getContext("2d");
      context.fillStyle = fill;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.95),
      );
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([blob], fileName, {
          type: "image/jpeg",
          lastModified: Date.now(),
        }),
      );
      zone.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    },
    { fill: color, fileName: name },
  );
}
