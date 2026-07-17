import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { hasFirmwareDiagnosticContract } from "../../src/makeable/actions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const COMPLIANT_FIRMWARE = `
const int PUMP_PIN = 8;
bool pumpActive = false;
unsigned long pumpOffDeadline = 0;

void stopPump() {
  digitalWrite(PUMP_PIN, LOW);
  pumpActive = false;
}

void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }
void reportCheck() { Serial.println("MAKEABLE|CHECK|pump|PASS|pulse complete"); }

void handleCommand(String line) {
  if (line.startsWith("MAKEABLE|STOP|")) {
    stopPump();
    return;
  }
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
  if (pumpActive && (long)(millis() - pumpOffDeadline) >= 0) {
    stopPump();
  }
  if (Serial.available()) handleCommand(Serial.readStringUntil('\\n'));
}
`;

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
