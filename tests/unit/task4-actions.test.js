import assert from "node:assert/strict";
import test from "node:test";

import * as actions from "../../src/makeable/actions.js";

const CONTRACT_SKETCH = `
const int PUMP_PIN = 8;
bool pumpActive = false;
unsigned long pumpOffDeadline = 0;
void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }
void reportCheck() { Serial.println("MAKEABLE|CHECK|sensor|PASS|value=1"); }
void handleCommand(String line) {
  if (line.startsWith("MAKEABLE|STOP|")) {
    digitalWrite(PUMP_PIN, LOW);
    pumpActive = false;
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
    digitalWrite(PUMP_PIN, LOW);
    pumpActive = false;
  }
  if (Serial.available()) handleCommand(Serial.readStringUntil('\\n'));
}
`;

test("assembly progress persists one current connection and completes only the final step", () => {
  assert.equal(typeof actions.advanceAssembly, "function");
  const wiring = {
    steps: [{ order: 1 }, { order: 2 }],
    currentStep: 0,
    completedSteps: [],
  };

  const first = actions.advanceAssembly(wiring);
  assert.deepEqual(first, {
    ...wiring,
    currentStep: 1,
    completedSteps: [0],
  });
  const final = actions.advanceAssembly(first);
  assert.deepEqual(final, {
    ...first,
    currentStep: 1,
    completedSteps: [0, 1],
  });
  assert.equal(actions.isAssemblyComplete(final), true);
  assert.equal(actions.selectAssemblyStep(final, 0).currentStep, 0);
});

test("the serial parser accepts stable markers across chunks and rejects arbitrary text", () => {
  assert.equal(typeof actions.createSerialMarkerParser, "function");
  const parser = actions.createSerialMarkerParser();

  assert.deepEqual(parser.push("boot noise\nMAKEABLE|READY|ESP"), []);
  assert.deepEqual(parser.push("32-S3\nMAKEABLE|CHECK|sensor|PASS|value=41\n"), [
    {
      type: "ready",
      board: "ESP32-S3",
      raw: "MAKEABLE|READY|ESP32-S3",
    },
    {
      type: "check",
      id: "sensor",
      status: "pass",
      detail: "value=41",
      raw: "MAKEABLE|CHECK|sensor|PASS|value=41",
    },
  ]);
  assert.deepEqual(parser.push("PASS\nMAKEABLE|POWER|STABLE\n"), []);
});

test("diagnostic commands are constrained and actuator pulses are short", () => {
  assert.equal(typeof actions.createSafeDiagnosticCommand, "function");
  assert.equal(
    actions.createSafeDiagnosticCommand({ id: "pump", kind: "actuator", pulseMs: 5000 }),
    "MAKEABLE|RUN|pump|1000\n",
  );
  assert.equal(
    actions.createSafeDiagnosticCommand({ id: "sensor", kind: "sensor" }),
    "MAKEABLE|RUN|sensor|0\n",
  );
  assert.throws(
    () =>
      actions.createSafeDiagnosticCommand({
        id: "pump\nMAKEABLE|RUN|relay|1000",
        kind: "actuator",
      }),
    /safe diagnostic id/i,
  );
});

test("power stability is inferred only after observation and fails on reset evidence", () => {
  assert.equal(typeof actions.inferPowerStatus, "function");
  assert.equal(
    actions.inferPowerStatus([{ type: "power", status: "stable" }], false).status,
    "waiting",
  );
  assert.deepEqual(actions.inferPowerStatus([], true), {
    status: "fail",
    detail: "The power observation did not include serial session health evidence.",
  });
  assert.deepEqual(
    actions.inferPowerStatus([], true, {
      sessionHealthy: true,
      observedMs: 2500,
    }),
    {
    status: "pass",
    detail: "No reset or brownout markers appeared during the observation window.",
    },
  );
  assert.deepEqual(
    actions.inferPowerStatus(
      [{ type: "reset", reason: "brownout", raw: "MAKEABLE|RESET|BROWNOUT" }],
      true,
    ),
    {
      status: "fail",
      detail: "The board reported a brownout reset.",
    },
  );
});

test("sequential diagnostics publish waiting/running/pass states and always close serial", async () => {
  assert.equal(typeof actions.runSequentialDiagnostics, "function");
  const writes = [];
  const transitions = [];
  let closed = 0;
  const markers = [
    { type: "ready", board: "ESP32-S3" },
    { type: "check", id: "sensor", status: "pass", detail: "value=41" },
  ];
  const session = {
    serialOutput: "MAKEABLE|READY|ESP32-S3\n",
    async write(value) {
      writes.push(value);
    },
    async waitForMarker(predicate) {
      return markers.find(predicate);
    },
    async observePower() {
      return { markers: [], sessionHealthy: true, observedMs: 2500 };
    },
    async close() {
      closed += 1;
    },
  };
  const result = await actions.runSequentialDiagnostics({
    diagnostics: [
      { id: "board", name: "Board responds", kind: "board", assemblyStep: 1 },
      { id: "sensor", name: "Sensor reads", kind: "sensor", assemblyStep: 2 },
      { id: "power", name: "Power stays steady", kind: "power", assemblyStep: 1 },
    ],
    session,
    onStatus(checks) {
      transitions.push(checks.map(({ status }) => status));
    },
  });

  assert.deepEqual(writes, ["MAKEABLE|RUN|sensor|0\n"]);
  assert.equal(transitions.some((statuses) => statuses.includes("running")), true);
  assert.deepEqual(
    result.checks.map(({ status }) => status),
    ["pass", "pass", "pass"],
  );
  assert.equal(result.serialOutput, session.serialOutput);
  assert.equal(closed, 1);
});

test("a diagnostic failure retains its assembly repair link and closes serial", async () => {
  let closed = 0;
  const session = {
    async write() {},
    async waitForMarker() {
      return { type: "check", id: "pump", status: "fail", detail: "no current" };
    },
    async close() {
      closed += 1;
    },
  };
  const result = await actions.runSequentialDiagnostics({
    diagnostics: [
      {
        id: "pump",
        name: "Pump spins",
        kind: "actuator",
        pulseMs: 750,
        assemblyStep: 3,
      },
    ],
    session,
  });

  assert.deepEqual(result.checks[0], {
    id: "pump",
    name: "Pump spins",
    kind: "actuator",
    pulseMs: 750,
    assemblyStep: 3,
    status: "fail",
    detail: "no current",
  });
  assert.equal(closed, 1);
});

test("local compile and Web Serial flash returns the detected board and disconnects transport", async () => {
  assert.equal(typeof actions.compileAndFlashFirmware, "function");
  let disconnected = 0;
  let writeOptions;
  const port = { id: "selected-port" };
  class Transport {
    constructor(receivedPort) {
      assert.equal(receivedPort, port);
    }
    async disconnect() {
      disconnected += 1;
    }
  }
  class ESPLoader {
    async main() {
      return "ESP32-S3";
    }
    async writeFlash(options) {
      writeOptions = options;
      options.reportProgress(0, 4, 8);
    }
    async after() {}
  }
  const progress = [];
  const result = await actions.compileAndFlashFirmware({
    sketch: CONTRACT_SKETCH,
    fqbn: "esp32:esp32:esp32",
    erase: true,
    serial: {
      async requestPort() {
        return port;
      },
    },
    fetchImpl: async (url) => {
      if (url === "/api/arduino/status") {
        return response({ hasArduinoCli: true, hasEsp32Core: true });
      }
      return response({
        ok: true,
        fqbn: "esp32:esp32:esp32",
        images: [
          {
            name: "firmware.bin",
            address: 0x10000,
            dataBase64: "AA==",
          },
        ],
      });
    },
    loadEsptool: async () => ({ Transport, ESPLoader }),
    onProgress(event) {
      progress.push(event);
    },
  });

  assert.equal(result.boardName, "ESP32-S3");
  assert.equal(result.fqbn, "esp32:esp32:esp32");
  assert.equal(writeOptions.eraseAll, true);
  assert.equal(progress.some(({ percent }) => percent === 50), true);
  assert.equal(disconnected, 1);
});

test("manual evaluation sends the requested action, camera evidence, and recent serial output", async () => {
  assert.equal(typeof actions.evaluateManualTest, "function");
  let payload;
  const result = await actions.evaluateManualTest({
    projectTitle: "Plant helper",
    requestedAction: "Lift the sensor out of the soil, wait 2 seconds, and watch for water.",
    imageDataUrl: "data:image/jpeg;base64,AA==",
    serialOutput: `old\n${"x".repeat(4000)}\nMAKEABLE|CHECK|pump|PASS`,
    fetchImpl: async (_url, init) => {
      payload = JSON.parse(init.body);
      return response({
        id: "resp_manual",
        output_text: JSON.stringify({
          status: "pass",
          observations: ["Water is visible at the plant."],
          nextStep: "Keep the electronics dry.",
        }),
      });
    },
  });

  const text = payload.input[1].content[0].text;
  assert.match(text, /Lift the sensor out of the soil/);
  assert.match(text, /MAKEABLE\|CHECK\|pump\|PASS/);
  assert.equal(text.includes("old\n"), false);
  assert.equal(payload.input[1].content[1].image_url, "data:image/jpeg;base64,AA==");
  assert.deepEqual(result, {
    responseId: "resp_manual",
    status: "pass",
    observations: ["Water is visible at the plant."],
    nextStep: "Keep the electronics dry.",
  });
});

function response(body, ok = true) {
  return {
    ok,
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    },
  };
}
