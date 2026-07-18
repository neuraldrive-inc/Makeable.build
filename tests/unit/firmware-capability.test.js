import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAndFlashFirmware,
  HARDWARE_PLAN_SCHEMA,
  hasFirmwareDiagnosticContract,
  normalizeHardwarePlan,
  requestHardwarePlan,
} from "../../src/makeable/actions.js";

const SENSOR_ONLY_FIRMWARE = `
void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }

void handleCommand(String line) {
  if (line.startsWith("MAKEABLE|RUN|")) {
    Serial.println("MAKEABLE|CHECK|pir|PASS|motion=0");
  }
}

void setup() {
  Serial.begin(115200);
  reportReset();
  reportReady();
}

void loop() {
  if (Serial.available()) handleCommand(Serial.readStringUntil('\\n'));
}
`;

const PREFIX_CONSTANT_FIRMWARE = `
const String runPrefix = "MAKEABLE|RUN|";
const String stopPrefix = "MAKEABLE|STOP|";

void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }

void handleCommand(String line) {
  if (line.startsWith(runPrefix)) {
    Serial.println("MAKEABLE|CHECK|pir|PASS|motion=0");
    Serial.println("MAKEABLE|CHECK|oled|PASS|display_updated");
    return;
  }
  if (line.startsWith(stopPrefix)) {
    Serial.println("MAKEABLE|CHECK|pir|PASS|stopped_no_actuator");
  }
}

void setup() {
  Serial.begin(115200);
  reportReset();
  reportReady();
}

void loop() {
  if (Serial.available()) handleCommand(Serial.readStringUntil('\\n'));
}
`;

const SENSOR_DIAGNOSTICS = [
  { id: "pir", name: "PIR sensor", kind: "sensor", pulseMs: 0, assemblyStep: 1 },
];

const ACTUATOR_DIAGNOSTICS = [
  { id: "fan", name: "Fan motor", kind: "actuator", pulseMs: 500, assemblyStep: 1 },
];

const DISPLAY_DIAGNOSTICS = [
  {
    id: "oled",
    name: "OLED I2C acknowledgement",
    kind: "display",
    pulseMs: 0,
    assemblyStep: 1,
  },
];

const UNSAFE_MISLABELED_ACTUATOR_FIRMWARE = `
const int MOTOR_PIN = 8;
void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }
void handleCommand(String line) {
  if (line.startsWith("MAKEABLE|RUN|")) {
    digitalWrite(MOTOR_PIN, HIGH);
    Serial.println("MAKEABLE|CHECK|pir|PASS|motion=1");
  }
}
void setup() { Serial.begin(115200); reportReset(); reportReady(); }
void loop() {
  if (Serial.available()) handleCommand(Serial.readStringUntil('\\n'));
}
`;

test("ready sensor-only firmware does not require actuator STOP and deadline code", () => {
  assert.equal(
    hasFirmwareDiagnosticContract(SENSOR_ONLY_FIRMWARE, SENSOR_DIAGNOSTICS),
    true,
  );
});

test("non-actuating diagnostics accept immutable command-prefix constants", () => {
  assert.equal(
    hasFirmwareDiagnosticContract(PREFIX_CONSTANT_FIRMWARE, [
      ...SENSOR_DIAGNOSTICS,
      ...DISPLAY_DIAGNOSTICS,
    ]),
    true,
  );
});

test("energizing code cannot bypass actuator safety through empty or mislabeled diagnostics", () => {
  assert.equal(
    hasFirmwareDiagnosticContract(UNSAFE_MISLABELED_ACTUATOR_FIRMWARE, []),
    false,
  );
  assert.equal(
    hasFirmwareDiagnosticContract(
      UNSAFE_MISLABELED_ACTUATOR_FIRMWARE,
      SENSOR_DIAGNOSTICS,
    ),
    false,
  );
  assert.equal(hasFirmwareDiagnosticContract(SENSOR_ONLY_FIRMWARE, []), false);
});

test("actuator diagnostics still require actuator STOP and deadline code", () => {
  assert.equal(
    hasFirmwareDiagnosticContract(SENSOR_ONLY_FIRMWARE, ACTUATOR_DIAGNOSTICS),
    false,
  );
});

test("display diagnostics are non-actuating capabilities with zero pulse duration", () => {
  assert.deepEqual(
    HARDWARE_PLAN_SCHEMA.properties.diagnostics.properties.tests.items.properties
      .kind.enum,
    ["board", "sensor", "display", "actuator", "power"],
  );

  const plan = normalizeHardwarePlan({
    diagnostics: {
      tests: [
        {
          id: "oled",
          name: "OLED I2C acknowledgement",
          kind: "actuator",
          pulseMs: 0,
          assemblyStep: 1,
        },
      ],
    },
  });

  assert.deepEqual(plan.diagnostics.tests, DISPLAY_DIAGNOSTICS);
  assert.equal(
    hasFirmwareDiagnosticContract(SENSOR_ONLY_FIRMWARE, [
      ...SENSOR_DIAGNOSTICS,
      ...DISPLAY_DIAGNOSTICS,
    ]),
    true,
  );
});

test("flash-time validation uses the stored diagnostic capabilities", async () => {
  class Transport {
    async disconnect() {}
  }
  class ESPLoader {
    async main() {
      return "ESP32";
    }
    async writeFlash() {}
    async after() {}
  }

  const result = await compileAndFlashFirmware({
    sketch: SENSOR_ONLY_FIRMWARE,
    diagnostics: SENSOR_DIAGNOSTICS,
    serial: { requestPort: async () => ({}) },
    fetchImpl: async (url) =>
      url === "/api/arduino/status"
        ? jsonResponse({ hasArduinoCli: true, hasEsp32Core: true })
        : jsonResponse({
            fqbn: "esp32:esp32:esp32",
            images: [
              {
                name: "MakeableSketch.ino.merged.bin",
                label: "Merged ESP32 firmware",
                address: 0,
                size: 1,
                dataBase64: "AA==",
              },
            ],
          }),
    loadEsptool: async () => ({ Transport, ESPLoader }),
  });

  assert.equal(result.boardName, "ESP32");
});

test("confirmed missing-parts plans reach feasibility without validating incomplete firmware", async () => {
  const plan = await requestHardwarePlan({
    idea: "Make a mini fan",
    confirmedParts: [
      { id: "esp32", name: "ESP32", confirmed: true },
      { id: "pir", name: "PIR sensor", confirmed: true },
      { id: "oled", name: "OLED display", confirmed: true },
    ],
    fetchImpl: responseFor(
      planPayload({
        status: "missing",
        diagnostics: SENSOR_DIAGNOSTICS,
        sketch: SENSOR_ONLY_FIRMWARE,
      }),
    ),
  });

  assert.equal(plan.feasibility.status, "missing");
});

test("confirmed ready sensor-only plans validate against their diagnostic capabilities", async () => {
  const plan = await requestHardwarePlan({
    idea: "Show motion on an OLED",
    confirmedParts: [
      { id: "esp32", name: "ESP32", confirmed: true },
      { id: "pir", name: "PIR sensor", confirmed: true },
      { id: "oled", name: "OLED display", confirmed: true },
    ],
    fetchImpl: responseFor(
      planPayload({
        status: "ready",
        diagnostics: SENSOR_DIAGNOSTICS,
        sketch: SENSOR_ONLY_FIRMWARE,
      }),
    ),
  });

  assert.equal(plan.feasibility.status, "ready");
});

test("a rejected ready-plan sketch gets one bounded firmware-only repair", async () => {
  const requests = [];
  const firstPlan = planPayload({
    status: "ready",
    diagnostics: [...SENSOR_DIAGNOSTICS, ...DISPLAY_DIAGNOSTICS],
    sketch: "void setup() {} void loop() {}",
  });
  const responses = [
    {
      id: "resp_initial_invalid",
      output_text: JSON.stringify(firstPlan),
    },
    {
      id: "resp_firmware_repair",
      output_text: JSON.stringify({
        language: "Arduino C++",
        sketch: SENSOR_ONLY_FIRMWARE,
        notes: "Repaired diagnostic firmware.",
      }),
    },
  ];

  const plan = await requestHardwarePlan({
    idea: "Show motion on an OLED",
    confirmedParts: [
      { id: "esp32", name: "ESP32", confirmed: true },
      { id: "pir", name: "PIR sensor", confirmed: true },
      { id: "oled", name: "OLED display", confirmed: true },
    ],
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return {
        ok: true,
        async text() {
          return JSON.stringify(responses.shift());
        },
      };
    },
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[1].text.format.name, "makeable_firmware_repair");
  assert.match(JSON.stringify(requests[1]), /Show motion status/);
  assert.match(JSON.stringify(requests[1]), /OLED I2C acknowledgement/);
  assert.equal(plan.firmware.sketch.trim(), SENSOR_ONLY_FIRMWARE.trim());
  assert.equal(plan.feasibility.status, "ready");
});

function responseFor(payload) {
  return async () => ({
    ok: true,
    async text() {
      return JSON.stringify({
        id: "resp_capability_test",
        output_text: JSON.stringify(payload),
      });
    },
  });
}

function jsonResponse(payload) {
  return {
    ok: true,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function planPayload({ status, diagnostics, sketch }) {
  return {
    projectTitle: "Motion display",
    summary: "Show PIR motion status on an OLED.",
    parts: [],
    feasibility: {
      status,
      reasons: status === "missing" ? ["A motor and fan blade are required."] : [],
    },
    missingParts:
      status === "missing"
        ? [
            {
              id: "motor",
              name: "Small DC motor",
              reason: "Creates airflow.",
              searchTerms: ["3V DC motor"],
              compatibleWith: ["esp32"],
              obtained: false,
            },
          ]
        : [],
    alternatives: [],
    wiringSteps: [],
    firmwareSpec: {
      board: "ESP32",
      behavior: "Show motion status.",
      libraries: [],
      pinAssignments: [],
      serialProtocol: [],
    },
    firmware: {
      language: "Arduino C++",
      sketch,
      notes: "Sensor-only diagnostic firmware.",
    },
    diagnostics: {
      warnings: [],
      tests: diagnostics,
      manualAction: "Move in front of the sensor.",
      manualQuestion: "Did the display change?",
      manualSuccessLabel: "Yes, the display changed",
    },
  };
}
