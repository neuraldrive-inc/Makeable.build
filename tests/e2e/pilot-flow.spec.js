import { expect, test } from "@playwright/test";

function beginnerPlan() {
  return {
    schemaVersion: 2,
    projectTitle: "Friendly motion light",
    summary: "An ESP32 light that reacts when a PIR sensor sees motion.",
    boardProfile: {
      profileId: "esp32",
      manufacturer: "Espressif-compatible",
      model: "ESP32 DevKit",
      revision: "Photo-confirmed layout",
      identityConfidence: 0.99,
      supportStatus: "exactly_supported",
      usbConnector: "Micro-USB",
      resetLabel: "EN",
      bootLabel: "BOOT",
      printedLabels: ["GND", "D25", "3V3"],
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
      {
        id: "board",
        name: "ESP32 DevKit",
        type: "controller",
        role: "Runs the project",
        confidence: 0.99,
        profileId: "esp32",
        compatibilityStatus: "exactly_supported",
        connectorType: "male header pins",
        bbox: { x: 12, y: 18, width: 32, height: 55 },
      },
      {
        id: "sensor",
        name: "PIR sensor",
        type: "sensor",
        role: "Detects motion",
        confidence: 0.97,
        profileId: "pir-generic",
        compatibilityStatus: "exactly_supported",
        connectorType: "male header pins",
        bbox: { x: 55, y: 22, width: 24, height: 42 },
      },
    ],
    preparation: {
      orientation: "Keep both printed label rows facing up.",
      usbCable: "Micro-USB data cable",
      requiredPartIds: ["board", "sensor"],
      wires: [
        { connectionId: "signal", color: "yellow", connectorType: "female-to-female jumper", quantity: 1 },
        { connectionId: "ground", color: "black", connectorType: "female-to-female jumper", quantity: 1 },
      ],
    },
    warnings: [],
    wiringSteps: [
      {
        order: 2,
        connectionId: "ground",
        connectionNumber: 2,
        title: "Share ground",
        action: "Connect the black female-to-female wire from GND to GND.",
        instruction: "Connect the black female-to-female wire from GND to GND.",
        from: "PIR sensor",
        to: "ESP32 DevKit",
        fromPartId: "sensor",
        toPartId: "board",
        pin: "GND",
        fromPrintedPin: "GND",
        toPrintedPin: "GND",
        fromElectricalAlias: "Ground",
        toElectricalAlias: "Ground",
        pinLocationsConfirmed: true,
        fromPinBbox: { x: 61, y: 54, width: 4, height: 5 },
        toPinBbox: { x: 29, y: 67, width: 3, height: 4 },
        wireColor: "black",
        wireType: "female-to-female jumper",
        quickCheck: "Both black wire ends are seated on GND.",
        check: "Both black wire ends are seated on GND.",
        why: "Both parts need the same electrical reference.",
        warning: "",
        requiredPartIds: ["sensor", "board"],
        accessibilityRank: 2,
      },
      {
        order: 1,
        connectionId: "signal",
        connectionNumber: 1,
        title: "Connect the motion signal",
        action: "Connect the yellow female-to-female wire from OUT to D25.",
        instruction: "Connect the yellow female-to-female wire from OUT to D25.",
        from: "PIR sensor",
        to: "ESP32 DevKit",
        fromPartId: "sensor",
        toPartId: "board",
        pin: "D25",
        fromPrintedPin: "OUT",
        toPrintedPin: "D25",
        fromElectricalAlias: "Signal output",
        toElectricalAlias: "GPIO 25",
        pinLocationsConfirmed: true,
        fromPinBbox: { x: 58, y: 45, width: 4, height: 5 },
        toPinBbox: { x: 29, y: 60, width: 3, height: 4 },
        wireColor: "yellow",
        wireType: "female-to-female jumper",
        quickCheck: "The board end is on D25, not the neighboring D26.",
        check: "The board end is on D25, not the neighboring D26.",
        why: "This carries the motion signal into the ESP32.",
        warning: "Leave USB unplugged while moving this wire.",
        requiredPartIds: ["sensor", "board"],
        accessibilityRank: 1,
      },
    ],
    diagnosticTests: [
      {
        name: "Motion signal",
        purpose: "Confirm motion reaches the board.",
        userAction: "Wave a hand in front of the white sensor dome.",
        expectedSerial: "MOTION_OK",
        failureTitle: "The motion signal did not reach the board.",
        recoveryAction: "Reseat the yellow wire on OUT and D25, then retry.",
        connectionId: "signal",
      },
    ],
    operatingGuide: {
      summary: "The white dome watches for movement in front of it and turns the light on.",
      steps: ["Point the white dome into the room.", "Move a hand across the front of the dome.", "Watch for the light and a MOTION_OK message."],
      successQuestion: "Did the light react when you moved across the front of the white dome?",
      unit: "No numeric unit; motion is shown as detected or clear",
      resetInstruction: "If it stops updating, press EN once—not BOOT—then try the motion again.",
    },
    firmwareSpec: {
      board: "ESP32 DevKit",
      behavior: "Report motion and turn on a light.",
      libraries: [],
      pinAssignments: [{ label: "D25", gpio: 25, mode: "INPUT", purpose: "PIR motion signal" }],
      serialProtocol: ["MOTION_OK"],
    },
    firmware: {
      language: "ESP32 C++",
      sketch: "void setup(){Serial.begin(115200);}\nvoid loop(){}",
      notes: "Use the printed D25 label.",
    },
  };
}

function unsafeUltrasonicPlan() {
  const plan = beginnerPlan();
  const signalTemplate = plan.wiringSteps.find(({ connectionId }) => connectionId === "signal");
  const groundTemplate = plan.wiringSteps.find(({ connectionId }) => connectionId === "ground");
  plan.projectTitle = "Ultrasonic ruler";
  plan.summary = "An ESP32 ruler powered over USB with a classic HC-SR04 sensor.";
  plan.boardProfile.printedLabels = ["5V", "GND", "D25", "D26"];
  plan.powerPlan = {
    mode: "usb_board_power",
    reason: "ordinary_low_current",
    boardRail: "USB-backed 5V/VBUS",
    highCurrentLoads: [],
    externalSupplies: [],
    externalPowerRequired: false,
    explanation: "The Micro-USB data cable powers the ESP32 and this low-current build. No battery is needed.",
    keepUsbConnected: true,
  };
  plan.parts[1] = {
    ...plan.parts[1],
    id: "sonar",
    name: "HC-SR04 ultrasonic sensor",
    type: "sensor",
    role: "Measures distance",
  };
  plan.preparation.requiredPartIds = ["board", "sonar"];
  plan.preparation.wires = [
    { connectionId: "echo", color: "yellow", connectorType: "female-to-female jumper", quantity: 1 },
    { connectionId: "trigger", color: "blue", connectorType: "female-to-female jumper", quantity: 1 },
    { connectionId: "ground", color: "black", connectorType: "female-to-female jumper", quantity: 1 },
    { connectionId: "power", color: "red", connectorType: "female-to-female jumper", quantity: 1 },
  ];
  plan.wiringSteps = [
    {
      ...signalTemplate,
      order: 1,
      accessibilityRank: 1,
      connectionId: "echo",
      action: "Connect the yellow female-to-female wire from ECHO to D25.",
      instruction: "Connect the yellow female-to-female wire from ECHO to D25.",
      fromPartId: "sonar",
      fromPrintedPin: "ECHO",
      fromElectricalAlias: "5 V ECHO output",
      requiredPartIds: ["sonar", "board"],
    },
    {
      ...signalTemplate,
      order: 2,
      accessibilityRank: 2,
      connectionId: "trigger",
      action: "Connect the blue female-to-female wire from TRIG to D26.",
      instruction: "Connect the blue female-to-female wire from TRIG to D26.",
      fromPartId: "sonar",
      fromPrintedPin: "TRIG",
      toPrintedPin: "D26",
      fromElectricalAlias: "Trigger input",
      toElectricalAlias: "GPIO 26",
      fromPinBbox: { x: 62, y: 48, width: 4, height: 5 },
      toPinBbox: { x: 29, y: 55, width: 3, height: 4 },
      wireColor: "blue",
      requiredPartIds: ["sonar", "board"],
    },
    {
      ...groundTemplate,
      order: 3,
      accessibilityRank: 3,
      connectionId: "ground",
      fromPartId: "sonar",
      requiredPartIds: ["sonar", "board"],
    },
    {
      ...signalTemplate,
      order: 4,
      accessibilityRank: 4,
      connectionId: "power",
      action: "Connect the red female-to-female wire from VCC to 5V.",
      instruction: "Connect the red female-to-female wire from VCC to 5V.",
      fromPartId: "sonar",
      fromPrintedPin: "VCC",
      toPrintedPin: "5V",
      fromElectricalAlias: "Sensor power input",
      toElectricalAlias: "USB-backed 5 V rail",
      fromPinBbox: { x: 66, y: 48, width: 4, height: 5 },
      toPinBbox: { x: 39, y: 67, width: 3, height: 4 },
      wireColor: "red",
      requiredPartIds: ["sonar", "board"],
    },
  ];
  plan.firmwareSpec = {
    board: "ESP32 DevKit",
    behavior: "Measure distance and report centimeters over USB serial.",
    libraries: [],
    pinAssignments: [
      { label: "D25", gpio: 25, mode: "INPUT", purpose: "Ultrasonic ECHO" },
      { label: "D26", gpio: 26, mode: "OUTPUT", purpose: "Ultrasonic TRIG" },
    ],
    serialProtocol: ["DISTANCE_CM"],
  };
  plan.diagnosticTests = [];
  return plan;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hasAccounts: false, hasOpenAIKey: true, hasGithubToken: true, apiBaseUrl: "" }),
    }),
  );
  await page.route("**/api/esp32/status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hasEsp32Compiler: true, hasEsp32Core: true }),
    }),
  );
  await page.goto("/pilot");
});

test("exact-label assembly unlocks a linear flash, automatic test, manual test, and publish path", async ({ page }) => {
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());

  await expect(page.getByText("Exact layout confirmed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start connection 1" })).toBeDisabled();
  await page.getByLabel("I have these parts and my wire ends match the guide.").check();
  await page.getByRole("button", { name: "Start connection 1" }).click();

  await expect(page.getByText("Yellow wire · Connection 1 · OUT → D25", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Connect the yellow female-to-female wire from OUT to D25.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I connected it" }).click();
  await expect(page.getByText("Black wire · Connection 2 · GND → GND", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "All wires connected" }).click();

  await page.evaluate(() => {
    window.__MAKEABLE_TEST_API__.setCompiledFirmware({ board: "esp32", sourceSketch: "void setup(){}" });
    window.__MAKEABLE_TEST_API__.setFlashStatus("success");
  });
  await expect(page.getByRole("button", { name: "Test my hardware" })).toBeVisible();
  await page.getByRole("button", { name: "Test my hardware" }).click();
  await expect(page.getByRole("heading", { name: /First listen/i })).toBeFocused();
  await expect(page.locator("#operatingGuide .operating-summary")).toContainText(/white dome watches for movement/i);
  await expect(page.getByRole("button", { name: /camera/i })).toHaveCount(0);

  await page.evaluate(() => window.__MAKEABLE_TEST_API__.setSerialLog("MOTION_OK\n"));
  await page.getByRole("button", { name: "Check fresh messages" }).click();
  await expect(page.getByText(/Board check passed/i)).toBeVisible();
  await page.getByRole("button", { name: "It worked" }).click();
  await page.getByRole("button", { name: "Celebrate this build" }).click();
  await expect(page.getByRole("heading", { name: /You made something real/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /You made something real/i })).toBeFocused();
  await expect(page.getByRole("button", { name: "Publish to GitHub" })).toBeEnabled();
  await expect(page.getByText(/Verified and ready/i)).toBeVisible();
});

test("the pilot shows the ESP32 score and explains the 55 percent boundary", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the board-confidence presentation");
  const plan = beginnerPlan();
  plan.boardProfile.identityConfidence = 0.54;
  plan.boardProfile.supportStatus = "compatible_with_differences";
  plan.parts[0].confidence = 0.54;
  plan.wiringSteps = [];
  plan.preparation.wires = [];
  plan.diagnosticTests = [];

  await page.evaluate((nextPlan) => window.__MAKEABLE_TEST_API__.loadPlan(nextPlan), plan);
  await expect(page.locator("#planIssues")).toContainText("ESP32 match: 54%");
  await expect(page.locator("#planIssues")).toContainText("at least 55%");
  await expect(page.locator("#beginAssemblyButton")).toHaveText("Confirm the board first");

  await page.locator('[data-workflow-stage="1"]').click();
  await expect(page.locator("#boardConfidence")).toBeVisible();
  await expect(page.locator("#boardConfidenceValue")).toHaveText("54% ESP32 match");
  await expect(page.locator("#boardConfidenceDetail")).toContainText("Below the 55% minimum");
  await expect(page.locator("#partsCountLabel")).toHaveText("2 parts found");
  await expect(page.locator("#partsList")).toContainText("ESP32 DevKit");
});

test("a 55 percent match distinguishes missing external wiring from a board-only build", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the zero-wiring decision");
  const externalBuild = beginnerPlan();
  externalBuild.boardProfile.identityConfidence = 0.55;
  externalBuild.boardProfile.supportStatus = "compatible_with_differences";
  externalBuild.wiringSteps = [];
  externalBuild.preparation.wires = [];
  externalBuild.diagnosticTests = [];

  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), externalBuild);
  await expect(page.locator("#planIssues")).toContainText("parts that need wiring");
  await expect(page.locator("#beginAssemblyButton")).toHaveText("Wiring needs one more detail");
  await expect(page.locator("#cableInventoryList")).toContainText("No safe jumper-wire map");
  await expect(page.locator("#showCodeButton")).toBeEnabled();
  await page.locator("#showCodeButton").click();
  await expect(page.locator("#codeWorkspace")).toBeVisible();

  const boardOnly = beginnerPlan();
  boardOnly.boardProfile.identityConfidence = 0.55;
  boardOnly.boardProfile.supportStatus = "compatible_with_differences";
  boardOnly.parts = [boardOnly.parts[0]];
  boardOnly.wiringSteps = [];
  boardOnly.preparation.requiredPartIds = ["board"];
  boardOnly.preparation.wires = [];
  boardOnly.diagnosticTests = [];
  boardOnly.firmwareSpec.pinAssignments = [];

  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), boardOnly);
  await expect(page.locator("#planIssues")).toBeHidden();
  await expect(page.locator("#beginAssemblyButton")).toHaveText("No wiring needed — continue to load");
  await expect(page.locator("#cableInventoryList")).toContainText("No jumper wires are needed");
  await expect(page.locator("#showWiringButton")).toBeHidden();
  await page.getByLabel("My board and USB data cable are ready.").check();
  await page.locator("#beginAssemblyButton").click();
  await expect(page.locator("#showCodeButton")).toHaveAttribute("aria-selected", "true");

  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await expect(page.locator("#buildPreparation")).toBeVisible();
  await expect(page.locator("#codeWorkspace")).toBeHidden();
  await expect(page.locator("#showWiringButton")).toBeVisible();
  await expect(page.locator("#preparationConfirmed")).not.toBeChecked();
});

test("a fresh diagnostic failure opens one exact wire and retry clears stale errors", async ({ page }) => {
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await page.evaluate(() => {
    window.__MAKEABLE_TEST_API__.setCompiledFirmware({ board: "esp32", sourceSketch: "void setup(){}" });
    window.__MAKEABLE_TEST_API__.setFlashStatus("success");
  });
  await page.getByRole("button", { name: "Test my hardware" }).click();
  await page.evaluate(() => window.__MAKEABLE_TEST_API__.setSerialLog("ERROR: motion signal timeout\n"));
  await page.getByRole("button", { name: "Check fresh messages" }).click();
  await expect(page.getByRole("heading", { name: "The motion signal did not reach the board." })).toBeVisible();
  await expect(page.locator("#diagnosticConnection")).toContainText("Yellow wire · Connection 1 · OUT → D25");
  await page.getByRole("button", { name: "Retry with fresh messages" }).click();
  await expect(page.getByText(/Old errors are cleared from this check/i)).toBeVisible();
  await expect(page.locator("#diagnosticRepairCard")).toBeHidden();
});

test("direct classic HC-SR04 ECHO warns honestly but the project continues", async ({ page }) => {
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), unsafeUltrasonicPlan());
  await expect(page.locator("#planIssues")).toContainText("Heads-up — you can continue");
  await expect(page.locator("#planIssues")).toContainText("A classic 5 V HC-SR04");
  await expect(page.locator("#planIssues")).toContainText("no level-shifter board or battery is required");
  await expect(page.locator("#planIssues")).not.toContainText("still needs");
  await expect(page.locator("#powerSourceTitle")).toHaveText("Powered by USB — no battery needed");
  await expect(page.locator("#usbCableGuide")).toContainText("No battery is needed");
  await page.getByLabel("I read the ECHO voltage note, and my board, USB cable, and wires are ready.").check();
  await expect(page.getByRole("button", { name: "Start connection 1" })).toBeEnabled();
  await page.getByRole("button", { name: "Start connection 1" }).click();
  await expect(page.locator("#wiringWorkspace")).toBeVisible();
  await expect(page.locator("#buildStepCounter")).toHaveText("Connection 1 of 4");
  await expect(page.locator(".step-copy-warning").filter({ hasText: "You can continue" })).toBeVisible();
  await expect(page.locator("#nextBuildStepButton")).toBeEnabled();
});

test("a generated OLED guide stays startable when the tiny module legend needs a user check", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers automatic action-label repair");
  const plan = beginnerPlan();
  plan.parts[1] = {
    ...plan.parts[1],
    name: "Small I2C OLED display",
    type: "display",
    role: "Shows motion status",
  };
  plan.wiringSteps[1] = {
    ...plan.wiringSteps[1],
    title: "Connect OLED data",
    action: "Connect the blue jumper from the OLED to the ESP32.",
    instruction: "Connect the blue jumper from the OLED to the ESP32.",
    fromPrintedPin: "SDA (check OLED legend)",
    toPrintedPin: "D25",
    fromElectricalAlias: "I2C data",
    wireColor: "blue",
  };

  await page.evaluate((nextPlan) => window.__MAKEABLE_TEST_API__.loadPlan(nextPlan), plan);
  await expect(page.locator("#planIssues")).not.toContainText("must name both printed pin labels");
  await expect(page.locator("#cableInventoryList")).toContainText("SDA (check OLED legend) → D25");
  await expect(page.locator("#beginAssemblyButton")).toHaveText("Start connection 1");
});

test("an incomplete HC-SR04 map pauses only wiring while code remains available", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the assembly-only completeness gate");
  const plan = unsafeUltrasonicPlan();
  plan.wiringSteps = plan.wiringSteps.filter(({ connectionId }) => connectionId === "echo");
  plan.preparation.wires = plan.preparation.wires.filter(({ connectionId }) => connectionId === "echo");
  await page.evaluate((nextPlan) => window.__MAKEABLE_TEST_API__.loadPlan(nextPlan), plan);
  await expect(page.locator("#planIssues")).toContainText("Before wiring the HC-SR04");
  await expect(page.locator("#planIssues")).toContainText("VCC, GND, TRIG");
  await expect(page.locator("#beginAssemblyButton")).toHaveText("Wiring needs one more detail");
  await expect(page.locator("#showCodeButton")).toBeEnabled();
  await page.locator("#showCodeButton").click();
  await expect(page.locator("#codeWorkspace")).toBeVisible();
});

test("an overcautious plan cannot turn a PIR sensor or spare battery into required power hardware", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers host-side power-plan cleanup");
  const plan = beginnerPlan();
  plan.parts.push({
    id: "battery",
    name: "9 V battery pack",
    type: "external power supply",
    role: "Generated spare power",
    confidence: 0.9,
    bbox: { x: 76, y: 12, width: 18, height: 24 },
  });
  plan.powerPlan = {
    ...plan.powerPlan,
    mode: "external_supply_required",
    reason: "high_current_load",
    highCurrentLoads: [
      {
        partId: "sensor",
        reason: "current_over_usb_budget",
        requiredVoltageVolts: 9,
        estimatedCurrentMilliamps: 1000,
        evidence: "Overcautious generated guess.",
      },
    ],
    externalSupplies: [
      {
        partId: "battery",
        outputVoltageVolts: 9,
        maxCurrentMilliamps: 500,
        evidence: "Overcautious generated guess.",
      },
    ],
    externalPowerRequired: true,
  };
  plan.preparation.requiredPartIds.push("battery");
  plan.preparation.wires.push({
    connectionId: "battery-power",
    color: "red",
    connectorType: "female-to-female jumper",
    quantity: 1,
  });
  plan.wiringSteps.push({
    ...plan.wiringSteps[0],
    order: 3,
    accessibilityRank: 3,
    connectionId: "battery-power",
    action: "Connect the red wire from + to VIN.",
    instruction: "Connect the red wire from + to VIN.",
    fromPartId: "battery",
    toPartId: "board",
    fromPrintedPin: "+",
    toPrintedPin: "VIN",
    fromElectricalAlias: "Battery positive",
    toElectricalAlias: "Board input",
    wireColor: "red",
    requiredPartIds: ["battery", "board"],
  });
  plan.projectTitle = "Battery-powered motion alarm";
  plan.summary = "Use the 9 V battery pack to run the motion alarm.";
  plan.operatingGuide.summary = "The battery-powered alarm watches for movement.";
  plan.operatingGuide.steps.push("Connect the battery pack before using the alarm.");
  plan.operatingGuide.resetInstruction = "Reconnect the battery pack if it stops.";
  plan.operatingGuide.successQuestion = "Did the battery power the alarm?";
  plan.warnings.push("Keep a spare battery ready.");
  plan.diagnosticTests[0] = {
    ...plan.diagnosticTests[0],
    name: "Battery check",
    purpose: "Confirm the battery powers the alarm.",
    userAction: "Connect the battery, then move your hand.",
    expectedSerial: "BATTERY_OK",
    failureTitle: "The battery did not power the alarm.",
    recoveryAction: "Replace the battery, then retry.",
  };
  plan.diagnosticTests.push({
    name: "Removed battery connection",
    purpose: "Test the battery wire that should be removed.",
    userAction: "Connect the battery.",
    expectedSerial: "BATTERY_WIRE_OK",
    failureTitle: "The battery wire failed.",
    recoveryAction: "Replace the battery wire.",
    connectionId: "battery-power",
  });
  plan.firmware.notes = "Power the board from the 9 V battery pack.";

  await page.evaluate((nextPlan) => window.__MAKEABLE_TEST_API__.loadPlan(nextPlan), plan);
  await expect(page.locator("#powerSourceTitle")).toHaveText("Powered by USB — no battery needed");
  await expect(page.locator("#partsList")).not.toContainText("battery");
  await expect(page.locator("#cableInventoryList")).not.toContainText("VIN");
  await expect(page.locator("#diagnosticsList")).not.toContainText("spare battery");
  await expect(page.locator("#operatingGuide")).not.toContainText("battery-powered");
  await expect(page.locator("#operatingGuide")).not.toContainText("Connect the battery pack");
  await expect(page.locator("#operatingGuide")).toContainText("no battery is needed");
  await expect(page.locator("#manualSuccessQuestion")).not.toContainText("battery");
  await expect(page.locator("#diagnosticsList")).not.toContainText("Connect the battery");
  await expect(page.locator("#diagnosticsList")).not.toContainText("BATTERY_OK");
  await expect(page.locator("#diagnosticsList")).not.toContainText("Removed battery connection");
  await expect(page.locator("#beginAssemblyButton")).toHaveText("Start connection 1");
});

test("invented battery prose is removed even when no battery part was returned", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers prose-only power cleanup");
  const plan = beginnerPlan();
  plan.projectTitle = "Battery motion light";
  plan.summary = "Run this motion light from a spare battery.";
  plan.operatingGuide.summary = "The battery powers a motion light.";
  plan.operatingGuide.steps = ["Connect the battery, then wave your hand."];
  plan.operatingGuide.successQuestion = "Did the battery-powered light react?";
  plan.warnings = ["Buy a spare battery before continuing."];
  plan.diagnosticTests[0].userAction = "Connect the battery before the motion check.";
  plan.firmware.notes = "A battery must remain connected.";

  await page.evaluate((nextPlan) => window.__MAKEABLE_TEST_API__.loadPlan(nextPlan), plan);
  await expect(page.locator("#powerSourceTitle")).toHaveText("Powered by USB — no battery needed");
  await expect(page.locator("#operatingGuide")).not.toContainText("Connect the battery");
  await expect(page.locator("#manualSuccessQuestion")).not.toContainText("battery-powered");
  await expect(page.locator("#diagnosticsList")).not.toContainText("Connect the battery");
  await expect(page.locator("#diagnosticsList")).not.toContainText("Buy a spare battery");
});

test("power-only references preserve a real unfamiliar load and demand its actual supply path", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers power evidence through host filtering");
  const plan = beginnerPlan();
  plan.parts.push(
    {
      id: "sounder",
      name: "Industrial warning sounder",
      type: "output",
      role: "Main alert",
      confidence: 0.95,
      bbox: { x: 72, y: 16, width: 18, height: 22 },
    },
    {
      id: "supply",
      name: "12 V battery pack",
      type: "external power supply",
      role: "Powers the sounder",
      confidence: 0.96,
      bbox: { x: 72, y: 48, width: 18, height: 24 },
    },
  );
  plan.powerPlan = {
    mode: "external_supply_required",
    reason: "high_current_load",
    boardRail: "USB for ESP32; 12 V for sounder",
    highCurrentLoads: [
      {
        partId: "sounder",
        reason: "requires_separate_voltage",
        requiredVoltageVolts: 12,
        estimatedCurrentMilliamps: 300,
        evidence: "The photographed sounder label says 12 V / 300 mA.",
      },
    ],
    externalSupplies: [
      {
        partId: "supply",
        outputVoltageVolts: 12,
        maxCurrentMilliamps: 1000,
        evidence: "The photographed battery-pack label says 12 V and 1 A.",
      },
    ],
    externalPowerRequired: true,
    explanation: "The sounder needs the photographed 12 V supply.",
    keepUsbConnected: true,
  };

  await page.evaluate((nextPlan) => window.__MAKEABLE_TEST_API__.loadPlan(nextPlan), plan);
  await expect(page.locator("#partsList")).toContainText("Industrial warning sounder");
  await expect(page.locator("#partsList")).toContainText("12 V battery pack");
  await expect(page.locator("#planIssues")).toContainText("power path");
  await expect(page.locator("#beginAssemblyButton")).toHaveText("Wiring needs one more detail");
  await expect(page.locator("#showCodeButton")).toBeEnabled();
});

test("an explicitly untethered idea still starts over USB without inventing a battery", async ({ page }) => {
  const portablePlan = beginnerPlan();
  portablePlan.parts.push({
    id: "portable_supply",
    name: "9 V battery pack",
    type: "external power supply",
    role: "Possible later portable power",
    confidence: 0.91,
    bbox: { x: 76, y: 12, width: 18, height: 24 },
  });
  portablePlan.powerPlan.externalSupplies = [
    {
      partId: "portable_supply",
      outputVoltageVolts: 9,
      maxCurrentMilliamps: 500,
      evidence: "Visible 9 V battery pack.",
    },
  ];
  portablePlan.wiringSteps.push({
    ...portablePlan.wiringSteps[0],
    order: 3,
    accessibilityRank: 3,
    connectionId: "portable-power",
    action: "Connect the red wire from + to VIN.",
    instruction: "Connect the red wire from + to VIN.",
    fromPartId: "portable_supply",
    toPartId: "board",
    fromPrintedPin: "+",
    toPrintedPin: "VIN",
    wireColor: "red",
    requiredPartIds: ["portable_supply", "board"],
  });
  await page.evaluate(
    ({ plan, userRequest }) => window.__MAKEABLE_TEST_API__.loadPlan(plan, "", { userRequest }),
    {
      plan: portablePlan,
      userRequest: "Make a portable motion alarm I can eventually use away from my desk.",
    },
  );
  await expect(page.locator("#powerSourceTitle")).toHaveText("Build over USB — portable power can come later");
  await expect(page.locator("#usbCableGuide")).toContainText("no battery is needed to continue");
  await expect(page.locator("#usbPowerLoadNote")).toContainText("Choose portable power only when you are ready");
  await expect(page.locator("#partsList")).not.toContainText("battery");
  await expect(page.locator("#cableInventoryList")).not.toContainText("VIN");
  await page.getByLabel("I have these parts and my wire ends match the guide.").check();
  await expect(page.getByRole("button", { name: "Start connection 1" })).toBeEnabled();
});

test("an optional completion photo stays private until consent and publishes in one atomic project update", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the media encoding contract");
  const projectPublishes = [];
  let repoCreates = 0;
  let failPublishOnce = true;
  const tokenPayload = Buffer.from(
    JSON.stringify({ sub: "beginner-maker", email: "beginner@example.com" }),
  ).toString("base64url");
  const accessToken = `header.${tokenPayload}.signature`;
  await page.addInitScript((token) => {
    sessionStorage.setItem(
      "makeable.auth.v1",
      JSON.stringify({
        accessToken: token,
        idToken: token,
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 60 * 60 * 1000,
      }),
    );
  }, accessToken);
  await page.route("**/api/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        hasAccounts: true,
        hasOpenAIKey: true,
        hasGithubToken: true,
        apiBaseUrl: "",
        cognitoDomain: "auth.makeable.test",
        cognitoClientId: "makeable-web",
        githubAtomicPublishSupported: true,
      }),
    }),
  );
  await page.route("**/api/account", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ credits: 10 }) }),
  );
  await page.route("**/api/github/repos", (route) => {
    repoCreates += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        owner: { login: "beginner-maker" },
        html_url: "https://github.com/beginner-maker/makeable-build",
        publishCapability: "project-scoped-capability",
      }),
    });
  });
  await page.route("**/api/github/publish-project", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    projectPublishes.push(body);
    if (failPublishOnce) {
      failPublishOnce = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary GitHub outage" }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, commitSha: "saved" }) });
  });
  await page.route("**/api/github/upload-file", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Media must not use the single-file API" }) }),
  );
  await page.reload();

  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await page.evaluate(() => {
    window.__MAKEABLE_TEST_API__.setCompiledFirmware({ board: "esp32", sourceSketch: "void setup(){}" });
    window.__MAKEABLE_TEST_API__.setFlashStatus("success");
    window.__MAKEABLE_TEST_API__.setAutomaticTestStatus("pass");
    window.__MAKEABLE_TEST_API__.setManualResult({ status: "pass", observation: "Motion turned the light on." });
  });
  await page.locator('[data-workflow-stage="3"]').click();
  await page.getByRole("button", { name: "Celebrate this build" }).click();

  const consent = page.getByLabel("Include in GitHub").first();
  await page.locator("#finishedBuildPhotoInput").setInputFiles(`${process.cwd()}/test image.jpg`);
  await page.locator("#creatorPhotoInput").setInputFiles(`${process.cwd()}/test image.jpg`);
  await expect(consent).toBeEnabled();
  await expect(consent).not.toBeChecked();
  expect(projectPublishes).toHaveLength(0);

  await consent.check();
  await page.getByLabel("Include in GitHub").nth(1).check();
  await page.getByLabel("Cover-photo description").fill("A finished motion light [on my desk]");
  await page.getByRole("button", { name: "Publish to GitHub" }).click();
  await expect(page.locator("#githubStatus")).toContainText("retry without creating another repository");
  await page.getByRole("button", { name: "Publish to GitHub" }).click();
  await expect(page.locator("#githubStatus")).toContainText("Saved:");
  await expect(page.getByRole("button", { name: "Published to GitHub" })).toBeDisabled();
  await expect(page.getByLabel("Include in GitHub").first()).toBeDisabled();
  await expect(page.locator("#publishGateNote")).toContainText(/keeps the files you chose in project history/i);

  expect(repoCreates).toBe(1);
  expect(projectPublishes).toHaveLength(2);
  expect(projectPublishes[0]).toMatchObject({
    owner: "beginner-maker",
    repo: "makeable-build",
    publishCapability: "project-scoped-capability",
  });
  const mediaFile = projectPublishes[0].files.find(({ path }) => path === "images/finished-build.svg");
  const creatorFile = projectPublishes[0].files.find(({ path }) => path === "images/creator-and-build.svg");
  const readmeFile = projectPublishes[0].files.find(({ path }) => path === "README.md");
  expect(mediaFile.content).toMatch(/^<svg[^>]+><image[^>]+href="data:image\/jpeg;base64,/);
  expect(creatorFile.content).toMatch(/^<svg[^>]+><image[^>]+href="data:image\/jpeg;base64,/);
  expect(mediaFile.contentBase64).toBeUndefined();
  expect(readmeFile.content).toContain("![A finished motion light on my desk](images/finished-build.svg)");
  expect(readmeFile.content).toContain("![Creator with A finished motion light on my desk](images/creator-and-build.svg)");
  expect(projectPublishes[0].files.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0)).toBeLessThan(400 * 1024);
  expect(JSON.stringify(projectPublishes[0]).length).toBeLessThan(512 * 1024);
  expect(projectPublishes.every(({ publishCapability }) => publishCapability === "project-scoped-capability")).toBe(true);
  expect(projectPublishes[1].files.map(({ path }) => path)).toEqual(projectPublishes[0].files.map(({ path }) => path));
  expect(projectPublishes[1].files.find(({ path }) => path === "images/finished-build.svg").content).toBe(mediaFile.content);
});

test("a host without atomic publishing keeps an optional photo in the browser", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the hosted privacy fallback");
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await page.evaluate(() => {
    window.__MAKEABLE_TEST_API__.setCompiledFirmware({ board: "esp32", sourceSketch: "void setup(){}" });
    window.__MAKEABLE_TEST_API__.setFlashStatus("success");
    window.__MAKEABLE_TEST_API__.setAutomaticTestStatus("pass");
    window.__MAKEABLE_TEST_API__.setManualResult({ status: "pass" });
  });
  await page.locator('[data-workflow-stage="3"]').click();
  await page.getByRole("button", { name: "Celebrate this build" }).click();
  await page.locator("#finishedBuildPhotoInput").setInputFiles(`${process.cwd()}/test image.jpg`);
  await page.getByLabel("Include in GitHub").first().check();
  await page.getByLabel("Cover-photo description").fill("My finished motion light");

  await expect(page.getByRole("button", { name: "Publish to GitHub" })).toBeDisabled();
  await expect(page.locator("#publishGateNote")).toContainText(/cannot publish photos atomically/i);
});

test("start over clears hardware evidence, the uploaded photo, and publishing consent", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the privacy reset contract");
  await page.locator("#ideaText").fill("Build a motion light");
  await page.locator("#partsPhotoInput").setInputFiles(`${process.cwd()}/test image.jpg`);
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await page.evaluate(() => {
    window.__MAKEABLE_TEST_API__.setCompiledFirmware({ board: "esp32", sourceSketch: "void setup(){}" });
    window.__MAKEABLE_TEST_API__.setFlashStatus("success");
    window.__MAKEABLE_TEST_API__.setAutomaticTestStatus("pass");
    window.__MAKEABLE_TEST_API__.setManualResult({ status: "pass" });
  });
  await page.locator('[data-workflow-stage="3"]').click();
  await page.getByRole("button", { name: "Celebrate this build" }).click();
  await page.locator("#finishedBuildPhotoInput").setInputFiles(`${process.cwd()}/test image.jpg`);
  await page.getByLabel("Include in GitHub").first().check();
  await page.locator("#repoNameInput").fill("keep-me-out");
  await page.locator("#privateRepoInput").uncheck();

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("heading", { name: /How would you like to start/i })).toBeVisible();
  const buildState = await page.evaluate(() => window.__MAKEABLE_TEST_API__.getState());
  expect(buildState).toMatchObject({
    compiled: false,
    flashStatus: "idle",
    automaticTestStatus: "pending",
    manualStatus: null,
    publishReady: false,
  });
  await expect(page.locator("body")).not.toHaveClass(/has-parts-photo/);
  await expect(page.getByLabel("Include in GitHub").first()).not.toBeChecked();
  await expect(page.getByLabel("Include in GitHub").first()).toBeDisabled();
  await expect(page.locator("#repoNameInput")).toHaveValue("makeable-build");
  await expect(page.locator("#privateRepoInput")).toBeChecked();
  await expect(page.locator("#compileFlashButton")).toHaveText("Choose my ESP32");
  await expect(page.locator("#compileFlashButton")).toBeEnabled();
  await expect(page.locator("#flashProgress")).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator("#flashProgressLabel")).toHaveText("Waiting to connect");
});

test("a completion photo that finishes loading after reset stays discarded", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the completion-photo race");
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await page.evaluate(() => {
    window.__MAKEABLE_TEST_API__.setCompiledFirmware({ board: "esp32", sourceSketch: "void setup(){}" });
    window.__MAKEABLE_TEST_API__.setFlashStatus("success");
    window.__MAKEABLE_TEST_API__.setAutomaticTestStatus("pass");
    window.__MAKEABLE_TEST_API__.setManualResult({ status: "pass" });
  });
  await page.locator('[data-workflow-stage="3"]').click();
  await page.getByRole("button", { name: "Celebrate this build" }).click();
  await page.evaluate(() => {
    const nativeRead = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function delayedRead(file) {
      setTimeout(() => nativeRead.call(this, file), 300);
    };
  });

  await page.locator("#finishedBuildPhotoInput").setInputFiles(`${process.cwd()}/test image.jpg`);
  await page.getByRole("button", { name: "Start over" }).click();
  await page.waitForTimeout(500);

  await expect(page.getByLabel("Include in GitHub").first()).toBeDisabled();
  await expect(page.getByLabel("Include in GitHub").first()).not.toBeChecked();
  await expect(page.locator("#finishedBuildPreview")).toBeHidden();
});

test("start over waits for an in-flight physical board load", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the operation-lock contract");
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await page.evaluate(() => window.__MAKEABLE_TEST_API__.setOperationActive("flash", true));

  await expect(page.getByRole("button", { name: "Start over" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Makeable home" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator('[data-workflow-stage="0"]')).toBeDisabled();
  await expect(page.locator("#clearPhotoButton")).toBeDisabled();
  await page.locator("#clearPhotoButton").dispatchEvent("click");
  expect(await page.evaluate(() => window.__MAKEABLE_TEST_API__.getState().board)).toBe("esp32");
  await page.getByRole("link", { name: "Makeable home" }).dispatchEvent("click");
  await expect(page.locator("#esp32Status")).toContainText(/Finish this board load before starting over/i);
  expect(await page.evaluate(() => window.__MAKEABLE_TEST_API__.getState().board)).toBe("esp32");

  await page.evaluate(() => window.__MAKEABLE_TEST_API__.setOperationActive("flash", false));
  await page.getByRole("button", { name: "Start over" }).click();
  expect(await page.evaluate(() => window.__MAKEABLE_TEST_API__.getState().board)).toBe(null);
});

test("loading a replacement plan invalidates the prior compile and flash evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the replan evidence contract");
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await page.evaluate(() => {
    window.__MAKEABLE_TEST_API__.setCompiledFirmware({ board: "esp32", sourceSketch: "old firmware" });
    window.__MAKEABLE_TEST_API__.setFlashStatus("success");
  });
  const replacement = beginnerPlan();
  replacement.projectTitle = "Replacement motion alarm";
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), replacement);
  const buildState = await page.evaluate(() => window.__MAKEABLE_TEST_API__.getState());
  expect(buildState).toMatchObject({ compiled: false, flashStatus: "idle", publishReady: false });
  await expect(page.getByRole("button", { name: "Test my hardware" })).toBeHidden();
});

test("a new automatic board check invalidates an older manual pass", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the verification epoch contract");
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await page.evaluate(() => {
    window.__MAKEABLE_TEST_API__.setCompiledFirmware({ board: "esp32", sourceSketch: "void setup(){}" });
    window.__MAKEABLE_TEST_API__.setFlashStatus("success");
    window.__MAKEABLE_TEST_API__.setAutomaticTestStatus("pass");
    window.__MAKEABLE_TEST_API__.setManualResult({ status: "pass" });
  });
  expect(await page.evaluate(() => window.__MAKEABLE_TEST_API__.getState())).toMatchObject({
    manualStatus: "pass",
    publishReady: true,
  });

  await page.evaluate(() => window.__MAKEABLE_TEST_API__.setAutomaticTestStatus("pass"));
  expect(await page.evaluate(() => window.__MAKEABLE_TEST_API__.getState())).toMatchObject({
    automaticTestStatus: "pass",
    manualStatus: null,
    publishReady: false,
  });
  await expect(page.getByRole("button", { name: "Celebrate this build" })).toBeHidden();

  await page.locator('[data-workflow-stage="3"]').click();
  await page.getByRole("button", { name: "Help me fix it" }).click();
  expect(await page.evaluate(() => window.__MAKEABLE_TEST_API__.getState())).toMatchObject({
    automaticTestStatus: "pending",
    manualStatus: null,
    publishReady: false,
  });
  await expect(page.locator("#verifyBehaviorButton")).toBeDisabled();
});

test("an account-free local guide finishes without a cloud account refresh", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the account-free generation contract");
  const generatedPlan = beginnerPlan();
  delete generatedPlan.firmware;
  generatedPlan.boardProfile.identityConfidence = 0.55;
  generatedPlan.boardProfile.supportStatus = "compatible_with_differences";
  generatedPlan.parts[0].confidence = 0.55;
  let accountRequests = 0;

  await page.route("**/api/account", (route) => {
    accountRequests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Cloud accounts are not configured locally." }),
    });
  });
  await page.route("**/api/openai/background", (route) => {
    const schemaName = route.request().postDataJSON()?.text?.format?.name;
    const output = schemaName === "hardware_project_plan"
      ? generatedPlan
      : {
          language: "ESP32 C++",
          sketch: "void setup(){Serial.begin(115200);}\nvoid loop(){}",
          notes: "Verified test firmware.",
        };
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "completed", output_text: JSON.stringify(output) }),
    });
  });
  await page.route("**/api/firmware/compile", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ board: "esp32", images: [{ offset: 0, base64: "AA==" }] }),
    }),
  );

  await page.locator("#ideaText").fill("Build a motion light");
  await page.locator("#partsPhotoInput").setInputFiles(`${process.cwd()}/test image.jpg`);
  await page.locator("#analyzeButton").click();

  await expect(page.locator("#transcriptBox")).toContainText("Your guide and code are ready");
  await expect(page.locator('[data-workflow-stage="2"]')).toHaveAttribute("aria-current", "step");
  await expect(page.locator("#boardIdentity")).toContainText("55% ESP32-family confidence (55% minimum)");
  await expect.poll(() => accountRequests).toBe(0);
  await expect(page.locator("#transcriptBox")).not.toContainText("couldn’t finish the code");
});

test("a late AI plan cannot overwrite a newly selected photo session", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the generation-session race");
  await page.evaluate(() => {
    sessionStorage.setItem(
      "makeable.auth.v1",
      JSON.stringify({ accessToken: "local-race-token", expiresAt: Date.now() + 60 * 60 * 1000 }),
    );
  });
  await page.reload();
  let releasePlan;
  let markRequestStarted;
  const requestStarted = new Promise((resolve) => {
    markRequestStarted = resolve;
  });
  const delayedPlan = new Promise((resolve) => {
    releasePlan = resolve;
  });
  await page.route("**/api/openai/background", async (route) => {
    markRequestStarted();
    await delayedPlan;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "completed", output_text: JSON.stringify(beginnerPlan()) }),
    });
  });

  const photoPath = `${process.cwd()}/test image.jpg`;
  await page.locator("#ideaText").fill("Build a motion light");
  await page.locator("#partsPhotoInput").setInputFiles(photoPath);
  await page.locator("#analyzeButton").click();
  await requestStarted;

  await page.locator("#partsPhotoInput").setInputFiles([]);
  await page.locator("#partsPhotoInput").setInputFiles(photoPath);
  releasePlan();

  await expect.poll(() => page.evaluate(() => window.__MAKEABLE_TEST_API__.getState().board)).toBe(null);
  await expect(page.getByText("Friendly motion light", { exact: true })).toHaveCount(0);
  await expect(page.locator("#analyzeButton")).toBeEnabled();
});

test("a late AI plan cannot overwrite an edited project idea", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the idea-generation race");
  await page.evaluate(() => {
    sessionStorage.setItem(
      "makeable.auth.v1",
      JSON.stringify({ accessToken: "local-idea-race-token", expiresAt: Date.now() + 60 * 60 * 1000 }),
    );
  });
  await page.reload();
  let releasePlan;
  let markRequestStarted;
  const requestStarted = new Promise((resolve) => {
    markRequestStarted = resolve;
  });
  const delayedPlan = new Promise((resolve) => {
    releasePlan = resolve;
  });
  await page.route("**/api/openai/background", async (route) => {
    markRequestStarted();
    await delayedPlan;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "completed", output_text: JSON.stringify(beginnerPlan()) }),
    });
  });

  await page.locator("#ideaText").fill("Build a motion light");
  await page.locator("#partsPhotoInput").setInputFiles(`${process.cwd()}/test image.jpg`);
  await page.locator("#analyzeButton").click();
  await requestStarted;

  await page.locator('[data-workflow-stage="0"]').click();
  await page.locator("#ideaText").fill("Build a quiet plant moisture reminder");
  releasePlan();

  await expect(page.locator("#ideaText")).toHaveValue("Build a quiet plant moisture reminder");
  await expect.poll(() => page.evaluate(() => window.__MAKEABLE_TEST_API__.getState().board)).toBe(null);
  await expect(page.getByText("Friendly motion light", { exact: true })).toHaveCount(0);
});

test("the wiring guide renders real pin crops from the uploaded photo without runtime errors", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser covers the canvas rendering contract");
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.locator("#ideaText").fill("Build a motion light");
  await page.locator("#partsPhotoInput").setInputFiles(`${process.cwd()}/test image.jpg`);
  await page.evaluate((plan) => window.__MAKEABLE_TEST_API__.loadPlan(plan), beginnerPlan());
  await page.getByLabel("I have these parts and my wire ends match the guide.").check();
  await page.getByRole("button", { name: "Start connection 1" }).click();

  const crops = page.locator("[data-pin-side]");
  await expect(crops).toHaveCount(2);
  await expect(crops.first()).toBeVisible();
  const rendered = await crops.evaluateAll((canvases) =>
    canvases.every((canvas) => {
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0) && canvas.toDataURL().length > 1_000;
    }),
  );
  expect(rendered).toBe(true);
  expect(pageErrors).toEqual([]);
});
