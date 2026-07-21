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
    powerPlan: {
      mode: "usb_board_power",
      reason: "ordinary_low_current",
      boardRail: "3V3",
      highCurrentLoads: [],
      externalSupplies: [],
      externalPowerRequired: false,
      explanation: "The Micro-USB data cable powers the ESP32 and this low-current build. No battery is needed.",
      keepUsbConnected: true,
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

test("a 55 percent ESP32 match keeps an unverified layout visible without stopping the project", () => {
  const raw = basePlan();
  raw.boardProfile.identityConfidence = 0.55;
  raw.boardProfile.supportStatus = "unverified";
  const issue = validateBeginnerPlan(normalizeBeginnerPlan(raw)).find(({ code }) => code === "unverified-board");
  assert.equal(issue?.severity, "warn");
  assert.match(issue?.message || "", /identity check passed at 55%/i);
  assert.match(issue?.message || "", /continue by matching the printed labels/i);
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

test("an imprecise connection still blocks while classic HC-SR04 voltage is advisory", () => {
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
  assert.ok(issues.some(({ code, severity }) => code === "unconfirmed-echo-voltage" && severity === "warn"));
  assert.equal(issues.some(({ code, severity }) => code === "unconfirmed-echo-voltage" && severity === "block"), false);
});

test("direct classic HC-SR04 ECHO can continue while a confirmed 3.3 V variant needs no advisory", () => {
  const classic = basePlan();
  classic.parts[1] = {
    ...classic.parts[1],
    id: "sonar",
    name: "HC-SR04 ultrasonic sensor",
    type: "sensor",
    role: "Measures distance",
  };
  classic.wiringSteps[0] = {
    ...classic.wiringSteps[0],
    connectionId: "echo",
    action: "Connect the yellow female-to-female wire from ECHO to D25.",
    fromPrintedPin: "ECHO",
    fromElectricalAlias: "5 V ECHO output",
    fromPartId: "sonar",
    requiredPartIds: ["sonar", "board"],
  };
  const classicIssues = validateBeginnerPlan(normalizeBeginnerPlan(classic));
  const advisory = classicIssues.find(({ code }) => code === "unconfirmed-echo-voltage");
  assert.equal(advisory?.severity, "warn");
  assert.match(advisory?.message || "", /direct one-off setup can work/i);
  assert.match(advisory?.message || "", /no level-shifter board or battery is required/i);
  assert.ok(classicIssues.some(({ code, severity }) => code === "incomplete-hcsr04-wiring" && severity === "block"));

  const reversed = structuredClone(classic);
  reversed.wiringSteps[0] = {
    ...reversed.wiringSteps[0],
    action: "Connect the yellow female-to-female wire from D25 to ECHO.",
    fromPrintedPin: "D25",
    toPrintedPin: "ECHO",
    fromElectricalAlias: "GPIO 25",
    toElectricalAlias: "5 V ECHO output",
    fromPartId: "board",
    toPartId: "sonar",
    fromPinBbox: classic.wiringSteps[0].toPinBbox,
    toPinBbox: classic.wiringSteps[0].fromPinBbox,
  };
  assert.ok(
    validateBeginnerPlan(normalizeBeginnerPlan(reversed)).some(
      ({ code, severity }) => code === "unconfirmed-echo-voltage" && severity === "warn",
    ),
  );

  const lowVoltage = structuredClone(classic);
  lowVoltage.parts[1] = {
    ...lowVoltage.parts[1],
    name: "HC-SR04-R 3.3 V-compatible ultrasonic sensor",
    confidence: 0.95,
    profileId: "hc-sr04-r-3v3",
    compatibilityStatus: "exactly_supported",
  };
  assert.equal(
    validateBeginnerPlan(normalizeBeginnerPlan(lowVoltage)).some(({ code }) => code === "unconfirmed-echo-voltage"),
    false,
  );

  const otherUltrasonic = structuredClone(classic);
  otherUltrasonic.parts[1] = {
    ...otherUltrasonic.parts[1],
    name: "US-100 ultrasonic sensor",
    profileId: "us-100",
    compatibilityStatus: "exactly_supported",
  };
  const otherUltrasonicIssues = validateBeginnerPlan(normalizeBeginnerPlan(otherUltrasonic));
  assert.equal(otherUltrasonicIssues.some(({ code }) => code === "unconfirmed-echo-voltage"), false);
  assert.equal(otherUltrasonicIssues.some(({ code }) => code === "incomplete-hcsr04-wiring"), false);
});

test("USB powers ordinary builds without a battery while high-current loads remain separate", () => {
  const ordinary = normalizeBeginnerPlan(basePlan());
  assert.equal(ordinary.powerPlan.mode, "usb_board_power");
  assert.equal(ordinary.powerPlan.externalPowerRequired, false);
  assert.match(ordinary.powerPlan.explanation, /no battery is needed/i);

  const contradictoryOrdinary = basePlan();
  contradictoryOrdinary.powerPlan = {
    mode: "external_supply_required",
    reason: "high_current_load",
    boardRail: "battery",
    highCurrentLoads: [],
    externalSupplies: [],
    externalPowerRequired: true,
    explanation: "Add a battery.",
    keepUsbConnected: false,
  };
  const normalizedContradiction = normalizeBeginnerPlan(contradictoryOrdinary);
  assert.equal(normalizedContradiction.powerPlan.mode, "usb_board_power");
  assert.equal(normalizedContradiction.powerPlan.reason, "ordinary_low_current");
  assert.doesNotMatch(normalizedContradiction.powerPlan.boardRail, /battery/i);
  assert.match(normalizedContradiction.powerPlan.explanation, /no battery is needed/i);
  assert.doesNotMatch(normalizedContradiction.powerPlan.explanation, /add a battery/i);

  const highCurrent = basePlan();
  highCurrent.parts.push({
    id: "servo",
    name: "High-current servo motor",
    type: "servo",
    role: "Moves the project",
    confidence: 0.98,
  });
  highCurrent.powerPlan = {
    mode: "usb_board_power",
    reason: "ordinary_low_current",
    boardRail: "5V",
    highCurrentLoads: [],
    externalSupplies: [],
    externalPowerRequired: false,
    explanation: "Try USB power.",
    keepUsbConnected: true,
  };
  const normalizedHighCurrent = normalizeBeginnerPlan(highCurrent);
  assert.equal(normalizedHighCurrent.powerPlan.mode, "external_supply_required");
  assert.equal(normalizedHighCurrent.powerPlan.reason, "high_current_load");
  assert.equal(normalizedHighCurrent.powerPlan.externalPowerRequired, true);
  assert.doesNotMatch(normalizedHighCurrent.powerPlan.explanation, /USB powers everything|no battery/i);

  for (const name of ["WS2812B LED strip", "12 V fan", "electromagnet coil"]) {
    const loadPlan = basePlan();
    loadPlan.parts.push({ id: "load", name, type: "output", role: "Main load", confidence: 0.95 });
    assert.equal(normalizeBeginnerPlan(loadPlan).powerPlan.reason, "high_current_load", name);
  }

  const relayModule = basePlan();
  relayModule.parts.push({
    id: "relay",
    name: "ESP32 relay module",
    type: "relay accessory",
    role: "Low-current control module",
    confidence: 0.95,
  });
  assert.equal(normalizeBeginnerPlan(relayModule).powerPlan.mode, "usb_board_power");

  const unfamiliarLoad = basePlan();
  unfamiliarLoad.parts.push({
    id: "sounder",
    name: "Industrial warning sounder",
    type: "output",
    role: "Main alert",
    confidence: 0.94,
  });
  unfamiliarLoad.powerPlan = {
    ...unfamiliarLoad.powerPlan,
    mode: "external_supply_required",
    reason: "high_current_load",
    highCurrentLoads: [
      {
        partId: "sounder",
        reason: "requires_separate_voltage",
        requiredVoltageVolts: 12,
        estimatedCurrentMilliamps: 0,
        evidence: "The photographed label says 12 V.",
      },
    ],
    externalPowerRequired: true,
  };
  const normalizedUnfamiliarLoad = normalizeBeginnerPlan(unfamiliarLoad);
  assert.equal(normalizedUnfamiliarLoad.powerPlan.reason, "high_current_load");
  assert.deepEqual(normalizedUnfamiliarLoad.powerPlan.highCurrentPartIds, ["sounder"]);

  const missingLoadReference = basePlan();
  missingLoadReference.powerPlan.highCurrentLoads = [
    {
      partId: "not-in-the-photo",
      reason: "requires_separate_voltage",
      requiredVoltageVolts: 12,
      estimatedCurrentMilliamps: 0,
      evidence: "Not actually visible.",
    },
  ];
  assert.equal(normalizeBeginnerPlan(missingLoadReference).powerPlan.mode, "usb_board_power");

  const overcautiousSensor = basePlan();
  overcautiousSensor.powerPlan.highCurrentLoads = [
    {
      partId: "sensor",
      reason: "current_over_usb_budget",
      requiredVoltageVolts: 12,
      estimatedCurrentMilliamps: 1000,
      evidence: "Incorrect model guess.",
    },
  ];
  assert.equal(normalizeBeginnerPlan(overcautiousSensor).powerPlan.mode, "usb_board_power");

  const spareBattery = basePlan();
  spareBattery.parts.push({ id: "battery", name: "12 V battery pack", type: "power supply", role: "Spare" });
  assert.equal(normalizeBeginnerPlan(spareBattery).powerPlan.mode, "usb_board_power");
});

test("only the original request can make a low-current project untethered, and USB still starts the build", () => {
  const modelCalledItPortable = basePlan();
  modelCalledItPortable.projectTitle = "Portable motion alarm";
  modelCalledItPortable.summary = "A wearable alert for a backpack.";
  const ordinary = normalizeBeginnerPlan(modelCalledItPortable);
  assert.equal(ordinary.powerPlan.reason, "ordinary_low_current");
  assert.equal(ordinary.powerPlan.mode, "usb_board_power");

  const explicitlyUntethered = normalizeBeginnerPlan(modelCalledItPortable, {
    userRequest: "Make a portable battery-powered motion alarm for my backpack.",
  });
  assert.equal(explicitlyUntethered.powerPlan.reason, "untethered_requested");
  assert.equal(explicitlyUntethered.powerPlan.mode, "usb_board_power");
  assert.equal(explicitlyUntethered.powerPlan.externalPowerRequired, false);
  assert.equal(explicitlyUntethered.powerPlan.keepUsbConnected, true);
  assert.match(explicitlyUntethered.powerPlan.explanation, /no battery is needed to continue/i);
  assert.match(explicitlyUntethered.powerPlan.explanation, /later/i);

  const explicitlyUsbOnly = normalizeBeginnerPlan(modelCalledItPortable, {
    userRequest: "Build a USB desk sensor, not a portable or battery-powered one.",
  });
  assert.equal(explicitlyUsbOnly.powerPlan.reason, "ordinary_low_current");
});

test("a high-current load keeps code available but needs a real supply power path before wiring", () => {
  const withoutSupply = basePlan();
  withoutSupply.parts.push({
    id: "servo",
    name: "Servo motor",
    type: "actuator",
    role: "Moves the project",
    bbox: { x: 74, y: 30, width: 18, height: 24 },
  });
  let normalized = normalizeBeginnerPlan(withoutSupply);
  assert.ok(
    validateBeginnerPlan(normalized).some(
      ({ code, severity }) => code === "missing-external-load-supply" && severity === "block",
    ),
  );

  const withSupply = structuredClone(withoutSupply);
  withSupply.parts.push({
    id: "supply",
    name: "6 V battery pack",
    type: "external power supply",
    role: "Powers the servo",
    confidence: 0.96,
    bbox: { x: 2, y: 8, width: 18, height: 22 },
  });
  withSupply.powerPlan.highCurrentLoads = [
    {
      partId: "servo",
      reason: "inductive_load",
      requiredVoltageVolts: 6,
      estimatedCurrentMilliamps: 500,
      evidence: "The confirmed servo specification allows 6 V and can draw 500 mA.",
    },
  ];
  withSupply.powerPlan.externalSupplies = [
    {
      partId: "supply",
      outputVoltageVolts: 6,
      maxCurrentMilliamps: 1000,
      evidence: "The photographed battery holder is fitted for a 6 V output.",
    },
  ];
  const lowConfidenceSupply = structuredClone(withSupply);
  lowConfidenceSupply.parts.find(({ id }) => id === "supply").confidence = 0.55;
  assert.ok(
    validateBeginnerPlan(normalizeBeginnerPlan(lowConfidenceSupply)).some(
      ({ code }) => code === "missing-external-load-supply",
    ),
  );
  normalized = normalizeBeginnerPlan(withSupply);
  assert.ok(validateBeginnerPlan(normalized).some(({ code }) => code === "incomplete-external-power-path"));

  const mismatchedSupply = structuredClone(withSupply);
  mismatchedSupply.powerPlan.externalSupplies[0].outputVoltageVolts = 12;
  const mismatchIssues = validateBeginnerPlan(normalizeBeginnerPlan(mismatchedSupply));
  assert.ok(mismatchIssues.some(({ code }) => code === "unconfirmed-external-supply-rating"));

  const unknownRatings = structuredClone(withSupply);
  unknownRatings.powerPlan.highCurrentLoads[0].requiredVoltageVolts = 0;
  unknownRatings.powerPlan.highCurrentLoads[0].estimatedCurrentMilliamps = 0;
  unknownRatings.powerPlan.externalSupplies[0].outputVoltageVolts = 0;
  unknownRatings.powerPlan.externalSupplies[0].maxCurrentMilliamps = 0;
  assert.ok(
    validateBeginnerPlan(normalizeBeginnerPlan(unknownRatings)).some(
      ({ code }) => code === "unconfirmed-external-supply-rating",
    ),
  );

  withSupply.wiringSteps.push(
    {
      connectionId: "servo-power",
      action: "Connect the red wire from + to VCC.",
      fromPartId: "supply",
      toPartId: "servo",
      fromPrintedPin: "+",
      toPrintedPin: "VCC",
      fromElectricalAlias: "Positive 6 V output",
      toElectricalAlias: "Servo power input",
      wireColor: "red",
      wireType: "female-to-female jumper",
      requiredPartIds: ["supply", "servo"],
      accessibilityRank: 3,
    },
    {
      connectionId: "servo-supply-ground",
      action: "Connect the brown wire from GND to GND.",
      fromPartId: "supply",
      toPartId: "servo",
      fromPrintedPin: "GND",
      toPrintedPin: "GND",
      fromElectricalAlias: "Supply ground",
      toElectricalAlias: "Servo ground",
      wireColor: "brown",
      wireType: "female-to-female jumper",
      requiredPartIds: ["supply", "servo"],
      accessibilityRank: 4,
    },
    {
      connectionId: "shared-ground",
      action: "Connect the white wire from GND to GND.",
      fromPartId: "servo",
      toPartId: "board",
      fromPrintedPin: "GND",
      toPrintedPin: "GND",
      fromElectricalAlias: "Servo and supply ground",
      toElectricalAlias: "ESP32 ground",
      wireColor: "white",
      wireType: "female-to-female jumper",
      requiredPartIds: ["servo", "board"],
      accessibilityRank: 5,
    },
  );
  normalized = normalizeBeginnerPlan(withSupply);
  const completeIssues = validateBeginnerPlan(normalized);
  assert.equal(completeIssues.some(({ code }) => code === "missing-external-load-supply"), false);
  assert.equal(completeIssues.some(({ code }) => code === "incomplete-external-power-path"), false);

  const routedThroughBoard = structuredClone(withSupply);
  routedThroughBoard.wiringSteps = routedThroughBoard.wiringSteps
    .filter(({ connectionId }) => connectionId !== "servo-power");
  routedThroughBoard.wiringSteps.push(
    {
      connectionId: "supply-to-board",
      action: "Connect the red wire from + to VIN.",
      fromPartId: "supply",
      toPartId: "board",
      fromPrintedPin: "+",
      toPrintedPin: "VIN",
      fromElectricalAlias: "Positive 6 V output",
      toElectricalAlias: "Board power input",
      wireColor: "orange",
      wireType: "female-to-female jumper",
      requiredPartIds: ["supply", "board"],
      accessibilityRank: 6,
    },
    {
      connectionId: "board-to-servo",
      action: "Connect the red wire from 5V to VCC.",
      fromPartId: "board",
      toPartId: "servo",
      fromPrintedPin: "5V",
      toPrintedPin: "VCC",
      fromElectricalAlias: "ESP32 5 V rail",
      toElectricalAlias: "Servo power input",
      wireColor: "purple",
      wireType: "female-to-female jumper",
      requiredPartIds: ["board", "servo"],
      accessibilityRank: 7,
    },
  );
  assert.ok(
    validateBeginnerPlan(normalizeBeginnerPlan(routedThroughBoard)).some(
      ({ code }) => code === "incomplete-external-power-path",
    ),
  );
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
      fromPartId: "sonar",
      toPartId: "board",
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
      fromPartId: "sonar",
      toPartId: "board",
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

test("uncertain photo markers stay visible as guidance instead of blocking wiring", () => {
  const raw = basePlan();
  raw.wiringSteps[0] = { ...raw.wiringSteps[0], pinLocationsConfirmed: false, toPinBbox: null };
  const issues = validateBeginnerPlan(normalizeBeginnerPlan(raw));
  assert.ok(issues.some(({ code, severity }) => code === "unconfirmed-pin-location" && severity === "warn"));
  assert.equal(issues.some(({ code, severity }) => code === "unconfirmed-pin-location" && severity === "block"), false);
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
