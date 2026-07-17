import assert from "node:assert/strict";
import test from "node:test";

import * as actions from "../../src/makeable/actions.js";

const CONTRACT_SKETCH = `
void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }
void reportCheck() { Serial.println("MAKEABLE|CHECK|sensor|PASS|value=1"); }
void handleCommand(String line) {
  if (line.startsWith("MAKEABLE|RUN|")) reportCheck();
}
void setup() { Serial.begin(115200); reportReset(); reportReady(); }
void loop() { if (Serial.available()) handleCommand(Serial.readStringUntil('\\n')); }
`;

test("flash transitions clear stale success before retry and persist terminal failure", () => {
  assert.equal(typeof actions.transitionFirmwareFlash, "function");
  const firmware = {
    sketch: CONTRACT_SKETCH,
    flash: {
      status: "success",
      boardName: "ESP32-S3",
      fqbn: "esp32:esp32:esp32",
    },
  };

  const pending = actions.transitionFirmwareFlash(firmware, "pending", {
    fqbn: "esp32:esp32:esp32",
  });
  assert.deepEqual(pending.flash, {
    status: "pending",
    fqbn: "esp32:esp32:esp32",
  });
  const failed = actions.transitionFirmwareFlash(pending, "failed", {
    error: "serial port closed",
  });
  assert.deepEqual(failed.flash, {
    status: "failed",
    error: "serial port closed",
  });
});

test("power observation fails when the serial session ended or produced no health evidence", () => {
  assert.deepEqual(
    actions.inferPowerStatus([], true, {
      sessionHealthy: false,
      observedMs: 2500,
    }),
    {
      status: "fail",
      detail: "The serial connection ended during the power observation.",
    },
  );
  assert.deepEqual(actions.inferPowerStatus([], true), {
    status: "fail",
    detail: "The power observation did not include serial session health evidence.",
  });
  assert.equal(
    actions.inferPowerStatus([], true, {
      sessionHealthy: true,
      observedMs: 2500,
    }).status,
    "pass",
  );
});

test("aborting a flash disconnects transport immediately while writeFlash is active", async () => {
  let disconnects = 0;
  let writeStarted;
  let rejectWrite;
  const started = new Promise((resolve) => {
    writeStarted = resolve;
  });
  class Transport {
    async disconnect() {
      disconnects += 1;
      rejectWrite?.(new DOMException("transport disconnected", "AbortError"));
    }
  }
  class ESPLoader {
    async main() {
      return "ESP32-S3";
    }
    writeFlash() {
      writeStarted();
      return new Promise((_resolve, reject) => {
        rejectWrite = reject;
      });
    }
  }
  const controller = new AbortController();
  const operation = actions.compileAndFlashFirmware({
    sketch: CONTRACT_SKETCH,
    serial: { requestPort: async () => ({}) },
    fetchImpl: compileFetch([
      firmwareImage("bootloader.bin", 0x1000, 8),
    ]),
    loadEsptool: async () => ({ Transport, ESPLoader }),
    signal: controller.signal,
  });
  await started;
  controller.abort();

  const outcome = await Promise.race([
    operation.then(
      () => ({ resolved: true }),
      (error) => ({ error }),
    ),
    new Promise((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), 100),
    ),
  ]);
  assert.equal(outcome.timedOut, undefined, "active writeFlash must be interrupted");
  assert.match(outcome.error?.message || "", /stopped|abort|disconnect/i);
  assert.equal(disconnects, 1);
});

test("multi-image flash reports aggregate progress instead of resetting per image", async () => {
  const percentages = [];
  class Transport {
    async disconnect() {}
  }
  class ESPLoader {
    async main() {
      return "ESP32";
    }
    async writeFlash({ reportProgress }) {
      reportProgress(0, 50, 100);
      reportProgress(1, 50, 100);
      reportProgress(1, 100, 100);
    }
    async after() {}
  }
  await actions.compileAndFlashFirmware({
    sketch: CONTRACT_SKETCH,
    serial: { requestPort: async () => ({}) },
    fetchImpl: compileFetch([
      firmwareImage("bootloader.bin", 0x1000, 100),
      firmwareImage("application.bin", 0x10000, 100),
    ]),
    loadEsptool: async () => ({ Transport, ESPLoader }),
    onProgress({ phase, percent }) {
      if (phase === "flash") percentages.push(percent);
    },
  });

  assert.deepEqual(percentages, [25, 75, 100]);
});

test("strict hardware plans require and normalize diagnostic and manual test fields", () => {
  assert.deepEqual(actions.HARDWARE_PLAN_SCHEMA.properties.diagnostics.required, [
    "warnings",
    "tests",
    "manualAction",
    "manualQuestion",
    "manualSuccessLabel",
  ]);
  const plan = actions.normalizeHardwarePlan({
    projectTitle: "Plant helper",
    summary: "Water a dry plant.",
    parts: [],
    feasibility: { status: "ready", reasons: [] },
    missingParts: [],
    alternatives: [],
    wiringSteps: [],
    firmwareSpec: {
      board: "ESP32",
      behavior: "Water the plant when soil is dry.",
      libraries: [],
      pinAssignments: [],
      serialProtocol: [],
    },
    firmware: {
      language: "Arduino C++",
      sketch: CONTRACT_SKETCH,
      notes: "",
    },
    diagnostics: {
      warnings: [],
      tests: [
        {
          id: "pump",
          name: "Pump spins",
          kind: "actuator",
          pulseMs: 5000,
          assemblyStep: 2,
        },
      ],
      manualAction: "Lift the sensor and watch for water.",
      manualQuestion: "Did water reach the plant?",
      manualSuccessLabel: "Yes, it watered the plant",
    },
  });

  assert.deepEqual(plan.diagnostics.tests[0], {
    id: "pump",
    name: "Pump spins",
    kind: "actuator",
    pulseMs: 1000,
    assemblyStep: 2,
  });
  assert.equal(plan.diagnostics.manualAction, "Lift the sensor and watch for water.");
  assert.equal(plan.diagnostics.manualQuestion, "Did water reach the plant?");
  assert.equal(plan.diagnostics.manualSuccessLabel, "Yes, it watered the plant");
});

test("firmware must emit READY CHECK RESET markers and handle safe RUN commands", () => {
  assert.equal(actions.hasFirmwareDiagnosticContract(CONTRACT_SKETCH), true);
  assert.equal(
    actions.hasFirmwareDiagnosticContract(`
      // Serial.println("MAKEABLE|READY|ESP32");
      // Serial.println("MAKEABLE|CHECK|sensor|PASS|value=1");
      /* Serial.println("MAKEABLE|RESET|POWER_ON"); */
      // if (line.startsWith("MAKEABLE|RUN|")) {}
      void setup() {}
    `),
    false,
  );
  assert.throws(
    () => actions.assertFirmwareDiagnosticContract("void setup() {}"),
    /READY.*CHECK.*RESET.*RUN/i,
  );
});

function firmwareImage(name, address, size) {
  return {
    name,
    label: name,
    address,
    size,
    dataBase64: "AA==",
  };
}

function compileFetch(images) {
  return async (url) => {
    if (url === "/api/arduino/status") {
      return response({ hasArduinoCli: true, hasEsp32Core: true });
    }
    return response({
      ok: true,
      fqbn: "esp32:esp32:esp32",
      images,
    });
  };
}

function response(body) {
  return {
    ok: true,
    async text() {
      return JSON.stringify(body);
    },
  };
}
