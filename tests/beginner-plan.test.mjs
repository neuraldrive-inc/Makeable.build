import test from "node:test";
import assert from "node:assert/strict";
import {
  ESP32_IDENTITY_CONFIDENCE_THRESHOLD,
  esp32IdentityAssessment,
  expectedDiagnosticHits,
  findDiagnosticFailure,
  normalizeBeginnerPlan,
  resolveWorkflowStage,
  validateBeginnerPlan,
  wireDescription,
} from "../pilot/lib/beginner-plan.mjs";

function basePlan() {
  return {
    projectTitle: "Motion light",
    summary: "An ESP32 light that reacts to motion.",
    boardProfile: {
      profileId: "esp32",
      manufacturer: "Espressif-compatible",
      model: "ESP32 DevKit",
      revision: "Confirmed from photo",
      identityConfidence: 0.98,
      supportStatus: "exactly_supported",
      usbConnector: "Micro-USB",
      resetLabel: "EN",
      bootLabel: "BOOT",
      printedLabels: ["D25", "3V3", "GND"],
    },
    parts: [
      { id: "board", name: "ESP32 DevKit", type: "controller", role: "Controller", confidence: 0.98, bbox: { x: 20, y: 50, width: 20, height: 30 } },
      { id: "sensor", name: "PIR sensor", type: "sensor", role: "Motion input", bbox: { x: 50, y: 35, width: 20, height: 30 } },
    ],
    wiringSteps: [
      {
        order: 2,
        connectionId: "signal",
        action: "Connect the yellow female-to-female wire from OUT to D25.",
        fromPrintedPin: "OUT",
        toPrintedPin: "D25",
        fromElectricalAlias: "OUT",
        toElectricalAlias: "GPIO 25",
        pinLocationsConfirmed: true,
        fromPinBbox: { x: 58, y: 44, width: 4, height: 5 },
        toPinBbox: { x: 28, y: 61, width: 3, height: 4 },
        fromPartId: "sensor",
        toPartId: "board",
        wireColor: "yellow",
        wireType: "female-to-female jumper",
        requiredPartIds: ["sensor", "board"],
        accessibilityRank: 1,
      },
      {
        order: 1,
        connectionId: "ground",
        action: "Connect the black female-to-female wire from GND to GND.",
        fromPrintedPin: "GND",
        toPrintedPin: "GND",
        fromPartId: "sensor",
        toPartId: "board",
        pinLocationsConfirmed: true,
        fromPinBbox: { x: 62, y: 44, width: 4, height: 5 },
        toPinBbox: { x: 28, y: 67, width: 3, height: 4 },
        wireColor: "black",
        wireType: "female-to-female jumper",
        requiredPartIds: ["sensor", "board"],
        accessibilityRank: 2,
      },
    ],
    diagnosticTests: [
      {
        name: "Motion signal",
        expectedSerial: "MOTION_OK",
        connectionId: "signal",
        failureTitle: "The motion signal did not arrive.",
        recoveryAction: "Reseat the yellow wire, then retry.",
      },
    ],
  };
}

function confirmedEchoPlan({
  protection = {
    id: "shift",
    name: "4-channel level shifter",
    type: "logic converter",
    role: "Shift ECHO from 5V to 3.3V",
    confidence: 0.98,
    profileId: "four-channel-5v-to-3v3-level-shifter",
    compatibilityStatus: "exactly_supported",
  },
  inputPin = "HV1",
  outputPin = "LV1",
} = {}) {
  const raw = basePlan();
  const protectionPart = {
    ...protection,
    bbox: protection.bbox || { x: 42, y: 42, width: 6, height: 12 },
  };
  raw.parts = [
    raw.parts[0],
    {
      id: "sonar",
      name: "HC-SR04 ultrasonic sensor",
      type: "sensor",
      role: "Distance",
      bbox: raw.parts[1].bbox,
    },
    protectionPart,
  ];
  raw.wiringSteps = [
    {
      connectionId: "echo-to-protection",
      action: `Connect ECHO to ${inputPin}.`,
      fromPrintedPin: "ECHO",
      toPrintedPin: inputPin,
      fromElectricalAlias: "5 V ECHO output",
      toElectricalAlias: "5 V-side input",
      fromPartId: "sonar",
      toPartId: protectionPart.id,
      pinLocationsConfirmed: true,
      fromPinBbox: { x: 58, y: 44, width: 4, height: 5 },
      toPinBbox: { x: 43, y: 44, width: 2, height: 2 },
      wireColor: "yellow",
      wireType: "female-to-female jumper",
      requiredPartIds: ["sonar", protectionPart.id],
      accessibilityRank: 1,
    },
    {
      connectionId: "protection-to-board",
      action: `Connect ${outputPin} to D25.`,
      fromPrintedPin: outputPin,
      toPrintedPin: "D25",
      fromElectricalAlias: "3.3 V-side output",
      toElectricalAlias: "GPIO 25",
      fromPartId: protectionPart.id,
      toPartId: "board",
      pinLocationsConfirmed: true,
      fromPinBbox: { x: 43, y: 50, width: 2, height: 2 },
      toPinBbox: { x: 28, y: 61, width: 3, height: 4 },
      wireColor: "green",
      wireType: "female-to-female jumper",
      requiredPartIds: [protectionPart.id, "board"],
      accessibilityRank: 2,
    },
  ];
  return raw;
}

test("normalization orders crowded connections first and preserves physical labels", () => {
  const plan = normalizeBeginnerPlan(basePlan());
  assert.deepEqual(plan.wiringSteps.map(({ connectionId }) => connectionId), ["signal", "ground"]);
  assert.equal(plan.wiringSteps[0].toPrintedPin, "D25");
  assert.equal(plan.wiringSteps[0].toElectricalAlias, "GPIO 25");
  assert.equal(wireDescription(plan.wiringSteps[0]), "Yellow wire · Connection 1 · OUT → D25");
  assert.deepEqual(validateBeginnerPlan(plan), []);
});

test("ESP32 identity uses a visible 55 percent threshold and reports the actual score", () => {
  assert.equal(ESP32_IDENTITY_CONFIDENCE_THRESHOLD, 0.55);

  const below = basePlan();
  below.boardProfile.identityConfidence = 0.54;
  const belowPlan = normalizeBeginnerPlan(below);
  const belowAssessment = esp32IdentityAssessment(belowPlan);
  const belowIssue = validateBeginnerPlan(belowPlan).find(({ code }) => code === "low-esp32-confidence");
  assert.equal(belowAssessment.percent, 54);
  assert.equal(belowAssessment.accepted, false);
  assert.match(belowIssue?.message || "", /ESP32 match: 54%/);
  assert.match(belowIssue?.message || "", /at least 55%/);

  const roundedBoundary = basePlan();
  roundedBoundary.boardProfile.identityConfidence = 0.549;
  const roundedAssessment = esp32IdentityAssessment(normalizeBeginnerPlan(roundedBoundary));
  assert.equal(roundedAssessment.percent, 54.9);
  assert.equal(roundedAssessment.accepted, false);

  const boundary = basePlan();
  boundary.boardProfile.identityConfidence = 0.55;
  const boundaryPlan = normalizeBeginnerPlan(boundary);
  const boundaryAssessment = esp32IdentityAssessment(boundaryPlan);
  const boundaryIssues = validateBeginnerPlan(boundaryPlan);
  assert.equal(boundaryAssessment.percent, 55);
  assert.equal(boundaryAssessment.accepted, true);
  assert.equal(boundaryIssues.some(({ code }) => code === "low-esp32-confidence"), false);
  assert.equal(boundaryIssues.some(({ code }) => code === "missing-esp32"), false);
});

test("ESP32 confidence cannot replace explicit board evidence or exact pin evidence", () => {
  const missingCandidate = basePlan();
  missingCandidate.parts[0] = {
    ...missingCandidate.parts[0],
    name: "Possible development board",
    type: "controller",
  };
  assert.ok(
    validateBeginnerPlan(normalizeBeginnerPlan(missingCandidate)).some(({ code }) => code === "missing-esp32"),
  );

  const missingScore = basePlan();
  delete missingScore.boardProfile.identityConfidence;
  assert.ok(
    validateBeginnerPlan(normalizeBeginnerPlan(missingScore)).some(
      ({ code }) => code === "missing-esp32-confidence",
    ),
  );

  const unsafePins = basePlan();
  unsafePins.boardProfile.identityConfidence = 0.55;
  unsafePins.wiringSteps[0] = {
    ...unsafePins.wiringSteps[0],
    pinLocationsConfirmed: false,
    toPinBbox: null,
  };
  const unsafeIssues = validateBeginnerPlan(normalizeBeginnerPlan(unsafePins));
  assert.equal(unsafeIssues.some(({ code }) => code === "low-esp32-confidence"), false);
  assert.ok(unsafeIssues.some(({ code }) => code === "unconfirmed-pin-location"));
});

test("a 55 percent ESP32 match does not bypass an unverified board layout", () => {
  const raw = basePlan();
  raw.boardProfile.identityConfidence = 0.55;
  raw.boardProfile.supportStatus = "unverified";
  const issue = validateBeginnerPlan(normalizeBeginnerPlan(raw)).find(({ code }) => code === "unverified-board");
  assert.equal(issue?.severity, "block");
  assert.match(issue?.message || "", /identity check passed at 55%/i);
});

test("a board match cannot hide missing external wiring while a board-only plan may continue", () => {
  const externalBuild = basePlan();
  externalBuild.boardProfile.identityConfidence = 0.55;
  externalBuild.wiringSteps = [];
  externalBuild.diagnosticTests = [];
  const externalIssues = validateBeginnerPlan(normalizeBeginnerPlan(externalBuild));
  assert.ok(externalIssues.some(({ code, severity }) => code === "missing-wiring-steps" && severity === "block"));

  const boardOnly = basePlan();
  boardOnly.boardProfile.identityConfidence = 0.55;
  boardOnly.parts = [
    boardOnly.parts[0],
    {
      id: "onboard-led",
      name: "Built-in LED",
      type: "onboard output",
      role: "Internal status light",
      confidence: 0.95,
      bbox: { x: 31, y: 58, width: 3, height: 3 },
    },
  ];
  boardOnly.wiringSteps = [];
  boardOnly.diagnosticTests = [];
  boardOnly.firmwareSpec = {
    board: "ESP32",
    behavior: "Print a message over USB serial.",
    libraries: [],
    pinAssignments: [{ label: "LED_BUILTIN", gpio: 2, mode: "OUTPUT", purpose: "Onboard status LED" }],
    serialProtocol: ["READY"],
  };
  const boardOnlyIssues = validateBeginnerPlan(normalizeBeginnerPlan(boardOnly));
  assert.equal(boardOnlyIssues.some(({ code }) => code === "missing-wiring-steps"), false);

  const esp32Accessory = basePlan();
  esp32Accessory.boardProfile.identityConfidence = 0.55;
  esp32Accessory.parts = [
    esp32Accessory.parts[0],
    {
      id: "relay",
      name: "ESP32 relay module",
      type: "relay accessory",
      role: "Switches an external load",
      confidence: 1,
      bbox: { x: 50, y: 35, width: 20, height: 30 },
    },
  ];
  esp32Accessory.wiringSteps = [];
  esp32Accessory.diagnosticTests = [];
  esp32Accessory.firmwareSpec = {
    board: "ESP32",
    behavior: "Switch the photographed relay.",
    libraries: [],
    pinAssignments: [],
    serialProtocol: [],
  };
  const accessoryPlan = normalizeBeginnerPlan(esp32Accessory);
  assert.equal(esp32IdentityAssessment(accessoryPlan).candidate?.id, "board");
  assert.ok(
    validateBeginnerPlan(accessoryPlan).some(
      ({ code, severity }) => code === "missing-wiring-steps" && severity === "block",
    ),
  );
});

test("imprecise instructions and unconfirmed ultrasonic voltage protection block wiring", () => {
  const raw = basePlan();
  raw.parts[1] = { id: "sonar", name: "HC-SR04 ultrasonic sensor", type: "sensor", role: "Distance" };
  raw.wiringSteps = [
    {
      connectionId: "echo",
      action: "Connect the signal wire to the ESP32.",
      fromPrintedPin: "ECHO",
      toPrintedPin: "D25",
      fromPartId: "sonar",
      toPartId: "board",
      wireColor: "yellow",
      wireType: "female-to-female jumper",
      requiredPartIds: ["sonar", "board"],
    },
  ];
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code, severity }) => code === "imprecise-labels" && severity === "block"));
  assert.ok(issues.some(({ code, severity }) => code === "unconfirmed-echo-voltage" && severity === "block"));
});

test("a photographed two-edge level-shifter path can protect an ultrasonic ECHO connection", () => {
  const raw = confirmedEchoPlan();
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.equal(issues.some(({ code }) => code === "unconfirmed-echo-voltage"), false);
});

test("naming a level shifter in prose cannot protect a direct ECHO-to-board connection", () => {
  const raw = confirmedEchoPlan();
  raw.wiringSteps = [
    {
      ...raw.wiringSteps[0],
      connectionId: "prose-only-echo",
      action: "Connect ECHO through the level shifter to D25.",
      toPrintedPin: "D25",
      toElectricalAlias: "GPIO 25",
      toPartId: "board",
      toPinBbox: { x: 28, y: 61, width: 3, height: 4 },
      requiredPartIds: ["sonar", "shift", "board"],
    },
  ];
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code, connectionId }) => code === "unconfirmed-echo-voltage" && connectionId === "prose-only-echo"));
});

test("an ambiguous or unverified level shifter cannot clear the ECHO safety gate", () => {
  const raw = confirmedEchoPlan({
    protection: {
      id: "shift",
      name: "Possible 1.8 V logic-level shifter",
      type: "logic converter",
      role: "Might shift ECHO from 5 V to 3.3 V",
      confidence: 0.1,
      profileId: "unverified-logic-board",
      compatibilityStatus: "unverified",
    },
  });
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code }) => code === "unconfirmed-echo-voltage"));
});

test("the high-side input and low-side output need meaningfully separate photographed pin locations", () => {
  const raw = confirmedEchoPlan();
  raw.wiringSteps[1].fromPinBbox = { ...raw.wiringSteps[0].toPinBbox, x: raw.wiringSteps[0].toPinBbox.x + 0.2 };
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code }) => code === "unconfirmed-echo-voltage"));
});

test("a multi-channel level shifter must use the same parseable channel on both sides", () => {
  const mismatch = confirmedEchoPlan({ inputPin: "HV-A", outputPin: "LV-B" });
  assert.ok(
    validateBeginnerPlan(normalizeBeginnerPlan(mismatch)).some(({ code }) => code === "unconfirmed-echo-voltage"),
  );

  const missingChannel = confirmedEchoPlan({ inputPin: "HV1", outputPin: "LV" });
  assert.ok(
    validateBeginnerPlan(normalizeBeginnerPlan(missingChannel)).some(({ code }) => code === "unconfirmed-echo-voltage"),
  );
});

test("a single series resistor never counts as HC-SR04 ECHO voltage protection", () => {
  const raw = basePlan();
  raw.parts = [
    raw.parts[0],
    { id: "sonar", name: "HC-SR04 ultrasonic sensor", type: "sensor", role: "Distance" },
    { id: "series", name: "1 kΩ resistor", type: "resistor", role: "Series resistor on ECHO" },
  ];
  raw.wiringSteps = [
    {
      ...raw.wiringSteps[0],
      connectionId: "echo",
      action: "Connect ECHO through the 1 kΩ resistor to D25.",
      fromPrintedPin: "ECHO",
      requiredPartIds: ["sonar", "series", "board"],
    },
  ];
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code }) => code === "unconfirmed-echo-voltage"));
});

test("loose resistors do not count as a confirmed ECHO protection topology", () => {
  const raw = basePlan();
  raw.parts = [
    raw.parts[0],
    { id: "sonar", name: "HC-SR04 ultrasonic sensor", type: "sensor", role: "Distance" },
    { id: "top", name: "1 kΩ resistor", type: "resistor", role: "ECHO high-side divider resistor" },
    { id: "bottom", name: "1.8 kΩ resistor", type: "resistor", role: "GND low-side divider resistor" },
  ];
  raw.wiringSteps = [
    {
      ...raw.wiringSteps[0],
      connectionId: "echo",
      action: "Connect ECHO through the confirmed voltage divider to D25.",
      why: "The 1 kΩ high-side and 1.8 kΩ low-side voltage divider reduces 5 V ECHO to about 3.2 V.",
      fromPrintedPin: "ECHO",
      requiredPartIds: ["sonar", "top", "bottom", "board"],
    },
  ];
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code }) => code === "unconfirmed-echo-voltage"));
});

test("a rated 5 V-to-3.3 V divider module can protect an ultrasonic ECHO connection", () => {
  const raw = confirmedEchoPlan({
    protection: {
      id: "divider",
      name: "Rated 5 V to 3.3 V voltage divider module",
      type: "voltage divider",
      role: "Protect ECHO",
      confidence: 0.99,
      profileId: "rated-5v-to-3v3-divider-module",
      compatibilityStatus: "exactly_supported",
    },
    inputPin: "IN",
    outputPin: "OUT",
  });
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.equal(issues.some(({ code }) => code === "unconfirmed-echo-voltage"), false);
});

test("every ultrasonic ECHO path must independently confirm voltage protection", () => {
  const raw = confirmedEchoPlan();
  raw.wiringSteps.push(
    {
      ...raw.wiringSteps[0],
      connectionId: "direct-echo",
      action: "Connect ECHO directly to D26.",
      fromPrintedPin: "ECHO",
      toPrintedPin: "D26",
      toPinBbox: { x: 33, y: 61, width: 3, height: 4 },
      fromPartId: "sonar",
      toPartId: "board",
      requiredPartIds: ["sonar", "board"],
    },
  );
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code, connectionId }) => code === "unconfirmed-echo-voltage" && connectionId === "direct-echo"));
});

test("printed pin labels require exact tokens instead of substrings", () => {
  const raw = basePlan();
  raw.wiringSteps[0] = {
    ...raw.wiringSteps[0],
    action: "Connect the yellow female-to-female wire from OUT to D25.",
    toPrintedPin: "D2",
  };
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code }) => code === "imprecise-labels"));
});

test("wiring blocks until both exact pin receptacles are confirmed in the photo", () => {
  const raw = basePlan();
  raw.wiringSteps[0] = { ...raw.wiringSteps[0], pinLocationsConfirmed: false, toPinBbox: null };
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code, severity }) => code === "unconfirmed-pin-location" && severity === "block"));
});

test("pin markers must reference existing parts, sit on those parts, and identify distinct endpoints", () => {
  const missingPart = basePlan();
  missingPart.wiringSteps[0] = { ...missingPart.wiringSteps[0], fromPartId: "invented-part" };
  assert.ok(validateBeginnerPlan(normalizeBeginnerPlan(missingPart)).some(({ code }) => code === "unknown-pin-part"));

  const outsidePart = basePlan();
  outsidePart.wiringSteps[0] = { ...outsidePart.wiringSteps[0], fromPinBbox: { x: 2, y: 2, width: 3, height: 3 } };
  assert.ok(validateBeginnerPlan(normalizeBeginnerPlan(outsidePart)).some(({ code }) => code === "pin-outside-part"));

  const identical = basePlan();
  identical.parts[1] = { ...identical.parts[1], bbox: identical.parts[0].bbox };
  identical.wiringSteps[0] = { ...identical.wiringSteps[0], fromPinBbox: identical.wiringSteps[0].toPinBbox };
  assert.ok(validateBeginnerPlan(normalizeBeginnerPlan(identical)).some(({ code }) => code === "identical-pin-locations"));
});

test("blank or duplicate part and connection ids block assembly tracking", () => {
  const blankIds = basePlan();
  blankIds.parts[1] = { ...blankIds.parts[1], id: "" };
  blankIds.wiringSteps[0] = { ...blankIds.wiringSteps[0], connectionId: "", fromPartId: "" };
  const blankIssues = validateBeginnerPlan(normalizeBeginnerPlan(blankIds));
  assert.ok(blankIssues.some(({ code }) => code === "missing-part-id"));
  assert.ok(blankIssues.some(({ code }) => code === "missing-connection-id"));

  const duplicateIds = basePlan();
  duplicateIds.parts[1] = { ...duplicateIds.parts[1], id: "board" };
  duplicateIds.wiringSteps[1] = { ...duplicateIds.wiringSteps[1], connectionId: "signal" };
  const duplicateIssues = validateBeginnerPlan(normalizeBeginnerPlan(duplicateIds));
  assert.ok(duplicateIssues.some(({ code }) => code === "duplicate-part-id"));
  assert.ok(duplicateIssues.some(({ code }) => code === "duplicate-connection-id"));
});

test("diagnostics map a failure to one persistent connection and count full markers", () => {
  const plan = normalizeBeginnerPlan(basePlan());
  const failure = findDiagnosticFailure("ERROR: motion signal timeout", plan);
  assert.equal(failure.connectionId, "signal");
  assert.equal(failure.toPrintedPin, "D25");
  assert.match(failure.recoveryAction, /yellow wire/i);
  assert.equal(expectedDiagnosticHits("READY\nMOTION_OK", plan.diagnosticTests).length, 1);
});

test("workflow cannot skip the plan, flash, automatic check, or manual check", () => {
  assert.equal(resolveWorkflowStage(4, { hasPlan: false }), 1);
  assert.equal(resolveWorkflowStage(4, { hasPlan: true, flashStatus: "idle" }), 2);
  assert.equal(
    resolveWorkflowStage(4, {
      hasPlan: true,
      flashStatus: "success",
      automaticTestStatus: "pending",
      manualTestStatus: "pending",
    }),
    3,
  );
  assert.equal(
    resolveWorkflowStage(4, {
      hasPlan: true,
      flashStatus: "success",
      automaticTestStatus: "pass",
      manualTestStatus: "pass",
    }),
    4,
  );
});
