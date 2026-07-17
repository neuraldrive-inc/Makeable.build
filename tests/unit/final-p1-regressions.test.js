import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  hasFirmwareDiagnosticContract,
  requestHardwarePlan,
} from "../../src/makeable/actions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const COMPLIANT_FIRMWARE = `
const int PUMP_PIN = 8;
bool pumpActive = false;
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

const ADVERSARIAL_FIRMWARE = `
const int PUMP_PIN = 8;
bool pumpActive = false;
unsigned long pumpOffDeadline = 0;

void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }
void reportCheck() { Serial.println("MAKEABLE|CHECK|pump|PASS|pulse complete"); }

void handleCommand(String line) {
  if (line.startsWith("MAKEABLE|RUN|")) {
    digitalWrite(PUMP_PIN, HIGH);
    pumpOffDeadline = millis() + 500;
    reportCheck();
  }
  if (line.startsWith("MAKEABLE|STOP|")) {
    return;
  }
}

void stopPump() {
  digitalWrite(PUMP_PIN, LOW);
}

void setup() { Serial.begin(115200); reportReset(); reportReady(); }
void loop() {
  pumpOffDeadline = millis() + 500;
  if (pumpActive && (long)(millis() - pumpOffDeadline) >= 0) {
    pumpActive = false;
  }
  if (Serial.available()) handleCommand(Serial.readStringUntil('\\n'));
}
`;

test("firmware diagnostics reject physical-off actions outside the actual STOP and deadline blocks", () => {
  assert.equal(hasFirmwareDiagnosticContract(ADVERSARIAL_FIRMWARE), false);
});

test("firmware diagnostics reject actuator writes and deadlines after control transfer", () => {
  const unreachableStop = COMPLIANT_FIRMWARE.replace(
    "digitalWrite(PUMP_PIN, LOW);\n    return;",
    "return;\n    digitalWrite(PUMP_PIN, LOW);",
  );
  const unreachableRun = COMPLIANT_FIRMWARE.replace(
    "pumpOffDeadline = millis() + pulseMs;\n    digitalWrite(PUMP_PIN, HIGH);",
    "return;\n    pumpOffDeadline = millis() + pulseMs;\n    digitalWrite(PUMP_PIN, HIGH);",
  );

  assert.equal(hasFirmwareDiagnosticContract(unreachableStop), false);
  assert.equal(hasFirmwareDiagnosticContract(unreachableRun), false);
});

test("firmware diagnostics reject actuator writes hidden in nested control blocks", () => {
  const nestedOff = COMPLIANT_FIRMWARE.replaceAll(
    "digitalWrite(PUMP_PIN, LOW);",
    "if (false) { digitalWrite(PUMP_PIN, LOW); }",
  );

  assert.equal(hasFirmwareDiagnosticContract(nestedOff), false);
});

test("firmware diagnostics reject actuator writes embedded in string literals", () => {
  const quotedOff = COMPLIANT_FIRMWARE.replaceAll(
    "digitalWrite(PUMP_PIN, LOW);",
    'Serial.println("digitalWrite(PUMP_PIN, LOW);");',
  );

  assert.equal(hasFirmwareDiagnosticContract(quotedOff), false);
});

test("firmware diagnostics reject actuator writes inside preprocessor-disabled sections", () => {
  const compiledOutOff = COMPLIANT_FIRMWARE.replaceAll(
    "digitalWrite(PUMP_PIN, LOW);",
    "#ifdef MAKEABLE_DISABLED\n    digitalWrite(PUMP_PIN, LOW);\n    #endif",
  );

  assert.equal(hasFirmwareDiagnosticContract(compiledOutOff), false);
});

test("firmware diagnostics reject actuator writes embedded in larger expressions", () => {
  const conditionalOff = COMPLIANT_FIRMWARE.replaceAll(
    "digitalWrite(PUMP_PIN, LOW);",
    "false && digitalWrite(PUMP_PIN, LOW);",
  );

  assert.equal(hasFirmwareDiagnosticContract(conditionalOff), false);
});

test("firmware diagnostics reject helper calls in place of direct physical shutoff", () => {
  const helperOnly = COMPLIANT_FIRMWARE
    .replace(
      "void reportReset()",
      "void stopPump() { digitalWrite(PUMP_PIN, LOW); }\n\nvoid reportReset()",
    )
    .replaceAll("digitalWrite(PUMP_PIN, LOW);", "stopPump();");

  assert.equal(hasFirmwareDiagnosticContract(helperOnly), false);
});

test("firmware diagnostics require STOP and deadline blocks to shut off the energized target", () => {
  const wrongTarget = COMPLIANT_FIRMWARE
    .replace("const int PUMP_PIN = 8;", "const int PUMP_PIN = 8;\nconst int LED_PIN = 2;")
    .replaceAll("digitalWrite(PUMP_PIN, LOW);", "digitalWrite(LED_PIN, LOW);");

  assert.equal(hasFirmwareDiagnosticContract(wrongTarget), false);
});

test("firmware diagnostics require executable STOP handling", () => {
  const missingStop = COMPLIANT_FIRMWARE.replace(
    /if \(line\.startsWith\("MAKEABLE\|STOP\|"\)\) \{[\s\S]*?return;\s*\}/,
    'if (line.startsWith("MAKEABLE|STOP|")) { return; }',
  );

  assert.equal(hasFirmwareDiagnosticContract(missingStop), false);
});

test("firmware diagnostics require a millis-based actuator-off deadline", () => {
  const missingDeadline = COMPLIANT_FIRMWARE
    .replace("pumpOffDeadline = millis() + pulseMs;", "")
    .replace(
      /if \(pumpActive && \(long\)\(millis\(\) - pumpOffDeadline\) >= 0\) \{[\s\S]*?\}/,
      "",
    );

  assert.equal(hasFirmwareDiagnosticContract(missingDeadline), false);
});

test("generated firmware with STOP and an internal safety deadline is accepted", () => {
  assert.equal(hasFirmwareDiagnosticContract(COMPLIANT_FIRMWARE), true);
});

test("hardware planning asks for direct physical safety writes that match validation", async () => {
  let requestPayload;
  await requestHardwarePlan({
    idea: "Pulse a pump",
    imageDataUrl: "data:image/jpeg;base64,AA==",
    fetchImpl: async (_url, init) => {
      requestPayload = JSON.parse(init.body);
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            id: "plan_direct_safety",
            output_text: JSON.stringify({
              projectTitle: "Safe pump",
              summary: "",
              parts: [],
              feasibility: { status: "ready", reasons: [] },
              missingParts: [],
              alternatives: [],
              wiringSteps: [],
              firmwareSpec: {
                board: "ESP32",
                behavior: "",
                libraries: [],
                pinAssignments: [],
                serialProtocol: [],
              },
              diagnostics: {
                warnings: [],
                tests: [],
                manualAction: "Observe it.",
                manualQuestion: "Did it work?",
                manualSuccessLabel: "Yes",
              },
            }),
          });
        },
      };
    },
  });

  assert.match(
    JSON.stringify(requestPayload),
    /direct physical (?:pin|PWM) writes.*do not delegate.*helper/i,
  );
  assert.match(
    JSON.stringify(requestPayload),
    /canonical rollover-safe.*\(long\).*millis\(\).*deadline.*>=.*0/i,
  );
});

test("parts photos use route aspect ratios instead of fixed HTML height attributes", async () => {
  const css = await readFile(path.join(root, "styles", "makeable.css"), "utf8");
  const rule = css.match(/\.parts-photo\s*\{(?<body>[^}]*)\}/)?.groups?.body || "";

  assert.match(rule, /\bheight\s*:\s*auto\s*;/);
});

test("annotation numbers have direct ink color and focused route headings suppress only their outline", async () => {
  const css = await readFile(path.join(root, "styles", "makeable.css"), "utf8");
  const numberRule =
    css.match(/\.part-number\s*\{(?<body>[^}]*)\}/)?.groups?.body || "";

  assert.match(numberRule, /\bcolor\s*:\s*var\(--makeable-color-ink\)\s*;/);
  assert.match(
    css,
    /\.route-screen h1:focus\s*\{[^}]*\boutline\s*:\s*(?:0|none)\s*;/s,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.route-screen h1\s*\{[^}]*\bscroll-margin-top\s*:\s*calc\([^;]*safe-area-inset-top[^;]*\)\s*;/,
  );
});
