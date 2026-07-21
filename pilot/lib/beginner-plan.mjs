const DEFAULT_WIRE_COLORS = Object.freeze([
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "red",
  "black",
  "white",
  "brown",
  "gray",
]);

const ESP32_BOOT_RISK_LABELS = new Set(["D0", "D2", "D12", "D15", "GPIO0", "GPIO2", "GPIO12", "GPIO15"]);
const SHAREABLE_POWER_LABELS = new Set(["GND", "3V3", "3.3V", "VIN", "5V"]);

export function normalizeBeginnerPlan(plan = {}) {
  const rawSteps = Array.isArray(plan.wiringSteps) ? plan.wiringSteps : [];
  const wiringSteps = rawSteps
    .map((step, index) => normalizeStep(step, index))
    .sort((left, right) => {
      const accessibility = left.accessibilityRank - right.accessibilityRank;
      return accessibility || left.order - right.order;
    })
    .map((step, index) => ({
      ...step,
      order: index + 1,
      connectionNumber: index + 1,
      connectionId: step.connectionId || `connection-${index + 1}`,
    }));

  const connectionIds = new Set(wiringSteps.map(({ connectionId }) => connectionId));
  const diagnosticTests = (Array.isArray(plan.diagnosticTests) ? plan.diagnosticTests : []).map(
    (test, index) => ({
      name: clean(test?.name, `Check ${index + 1}`),
      purpose: clean(test?.purpose, "Confirm this part is responding."),
      userAction: clean(test?.userAction, "Operate the project once."),
      expectedSerial: clean(test?.expectedSerial, "READY"),
      failureTitle: clean(test?.failureTitle, "The expected board message was not detected."),
      recoveryAction: clean(test?.recoveryAction, "Check the related connection, then retry."),
      connectionId: connectionIds.has(clean(test?.connectionId)) ? clean(test.connectionId) : "",
    }),
  );

  return {
    ...plan,
    schemaVersion: 2,
    boardProfile: normalizeBoardProfile(plan.boardProfile),
    preparation: normalizePreparation(plan.preparation, wiringSteps),
    wiringSteps,
    diagnosticTests,
    operatingGuide: normalizeOperatingGuide(plan.operatingGuide),
    warnings: Array.isArray(plan.warnings) ? plan.warnings.map((value) => clean(value)).filter(Boolean) : [],
  };
}

export function validateBeginnerPlan(plan = {}) {
  const issues = [];
  const parts = Array.isArray(plan.parts) ? plan.parts : [];
  const normalizedPartIds = parts.map((part) => clean(part?.id));
  const partIds = new Set(normalizedPartIds.filter(Boolean));
  const partsById = new Map(parts.map((part) => [clean(part?.id), part]).filter(([partId]) => partId));
  const steps = Array.isArray(plan.wiringSteps) ? plan.wiringSteps : [];
  const usedTargetPins = new Map();
  const usedColors = new Map();
  const usedConnectionIds = new Set();

  normalizedPartIds.forEach((partId, index) => {
    if (!partId) {
      issues.push(issue("block", "missing-part-id", `Confirmed part ${index + 1} needs a stable non-empty id.`));
      return;
    }
    if (normalizedPartIds.indexOf(partId) !== index) {
      issues.push(issue("block", "duplicate-part-id", `The part id ${partId} is used more than once.`));
    }
  });

  if (!parts.some((part) => /esp32/i.test(`${part?.name || ""} ${part?.type || ""}`))) {
    issues.push(issue("block", "missing-esp32", "I could not confidently identify an ESP32 in this photo."));
  }

  if (plan.boardProfile?.supportStatus === "unverified") {
    issues.push(
      issue(
        "block",
        "unverified-board",
        "This exact board layout is not verified yet. Confirm the model or use a supported board before wiring.",
      ),
    );
  }

  for (const step of steps) {
    const connectionId = clean(step.connectionId);
    if (!connectionId || step.connectionIdConfirmed === false) {
      issues.push(
        issue(
          "block",
          "missing-connection-id",
          `Connection ${step.connectionNumber || step.order} needs a stable non-empty id.`,
        ),
      );
    } else if (usedConnectionIds.has(connectionId)) {
      issues.push(
        issue(
          "block",
          "duplicate-connection-id",
          `The connection id ${connectionId} is used more than once, so the build cannot track both wires safely.`,
          connectionId,
        ),
      );
    } else {
      usedConnectionIds.add(connectionId);
    }
    const fromPin = canonicalPin(step.fromPrintedPin || step.from);
    const toPin = canonicalPin(step.toPrintedPin || step.pin || step.to);
    const action = clean(step.action || step.instruction);
    const normalizedAction = action.toUpperCase();
    const requiredPartIds = Array.isArray(step.requiredPartIds) ? step.requiredPartIds : [];
    const fromPartId = clean(step.fromPartId);
    const toPartId = clean(step.toPartId);
    const fromPart = fromPartId ? partsById.get(fromPartId) : null;
    const toPart = toPartId ? partsById.get(toPartId) : null;

    for (const partId of requiredPartIds) {
      if (partId && !partIds.has(partId)) {
        issues.push(
          issue(
            "block",
            "missing-required-part",
            `Connection ${step.connectionNumber || step.order} needs a part that was not confirmed: ${partId}.`,
            connectionId,
          ),
        );
      }
    }

    if (!fromPin || !toPin || !actionNamesExactPin(normalizedAction, fromPin) || !actionNamesExactPin(normalizedAction, toPin)) {
      issues.push(
        issue(
          "block",
          "imprecise-labels",
          `Connection ${step.connectionNumber || step.order} must name both printed pin labels in the action.`,
          connectionId,
        ),
      );
    }

    if (
      step.pinLocationsConfirmed !== true ||
      !isConfirmedPinBox(step.fromPinBbox) ||
      !isConfirmedPinBox(step.toPinBbox)
    ) {
      issues.push(
        issue(
          "block",
          "unconfirmed-pin-location",
          `Connection ${step.connectionNumber || step.order} needs a clear photo of both exact pin receptacles before wiring can begin.`,
          connectionId,
        ),
      );
    } else {
      if (!fromPart || !toPart) {
        issues.push(
          issue(
            "block",
            "unknown-pin-part",
            `Connection ${step.connectionNumber || step.order} must link both pin markers to confirmed parts in the photo.`,
            connectionId,
          ),
        );
      } else if (
        !pinBoxBelongsToPart(step.fromPinBbox, fromPart.bbox) ||
        !pinBoxBelongsToPart(step.toPinBbox, toPart.bbox)
      ) {
        issues.push(
          issue(
            "block",
            "pin-outside-part",
            `Connection ${step.connectionNumber || step.order} has a pin marker outside its referenced part. Take a clearer photo before wiring.`,
            connectionId,
          ),
        );
      }

      if (boxesAreEffectivelyIdentical(step.fromPinBbox, step.toPinBbox)) {
        issues.push(
          issue(
            "block",
            "identical-pin-locations",
            `Connection ${step.connectionNumber || step.order} points both wire ends at the same photo location. Confirm each physical receptacle separately.`,
            connectionId,
          ),
        );
      }
    }

    if (!clean(step.wireType)) {
      issues.push(
        issue(
          "block",
          "missing-wire-type",
          `Connection ${step.connectionNumber || step.order} does not identify the jumper connector type.`,
          connectionId,
        ),
      );
    }

    if (ESP32_BOOT_RISK_LABELS.has(toPin)) {
      issues.push(
        issue(
          "warn",
          "boot-risk-pin",
          `${displayPin(toPin)} can affect startup on some ESP32 boards. Confirm this assignment before powering the build.`,
          connectionId,
        ),
      );
    }

    if (!SHAREABLE_POWER_LABELS.has(toPin)) {
      const previous = usedTargetPins.get(toPin);
      if (toPin && previous) {
        issues.push(
          issue(
            "block",
            "duplicate-pin",
            `${displayPin(toPin)} is assigned to both ${previous} and ${connectionId}.`,
            connectionId,
          ),
        );
      } else if (toPin) {
        usedTargetPins.set(toPin, connectionId);
      }
    }

    const color = clean(step.wireColor).toLowerCase();
    if (color) {
      const previous = usedColors.get(color);
      if (previous) {
        issues.push(
          issue(
            "warn",
            "reused-wire-color",
            `${capitalize(color)} is reused. Keep the connection number visible so the wires cannot be confused.`,
            connectionId,
          ),
        );
      } else {
        usedColors.set(color, connectionId);
      }
    }
  }

  const planText = JSON.stringify(plan).toLowerCase();
  const hasHcSr04 = /hc[- ]?sr04|ultrasonic.*echo|echo.*ultrasonic/.test(planText);
  const echoSteps = steps.filter((step) => {
    const fromPart = partsById.get(clean(step.fromPartId));
    const printedSource = canonicalPin(step.fromPrintedPin || step.from);
    return printedSource === "ECHO" || (isHcSr04Part(fromPart) && /echo/i.test(`${step.action || ""}`));
  });
  if (hasHcSr04) {
    for (const echoStep of echoSteps) {
      if (hasConfirmedEchoProtection(echoStep, parts, steps)) continue;
      issues.push(
        issue(
          "block",
          "unconfirmed-echo-voltage",
          "The ultrasonic ECHO signal may exceed the ESP32 input voltage. Confirm two photographed connections through a rated divider module or level shifter: ECHO to its 5 V-side input, then its 3.3 V-side output to the ESP32.",
          echoStep.connectionId,
        ),
      );
    }
  }

  return dedupeIssues(issues);
}

export function findDiagnosticFailure(logText, plan = {}) {
  const log = clean(logText).toLowerCase();
  if (!log) return null;
  const diagnostics = Array.isArray(plan.diagnosticTests) ? plan.diagnosticTests : [];
  const steps = Array.isArray(plan.wiringSteps) ? plan.wiringSteps : [];

  const explicit = diagnostics.find((test) => {
    const candidates = [test.name, test.failureTitle, test.connectionId]
      .flatMap((value) => clean(value).toLowerCase().split(/[^a-z0-9]+/))
      .filter((token) => token.length >= 4 && !["check", "test", "connection", "expected"].includes(token));
    return candidates.some((token) => log.includes(token)) && /(error|fail|timeout|missing|invalid|nan)/.test(log);
  });

  const echoFallback = /echo/.test(log)
    ? diagnostics.find((test) => /echo/i.test(`${test.name} ${test.failureTitle} ${test.purpose}`)) ||
      { connectionId: steps.find((step) => /echo/i.test(`${step.action} ${step.fromPrintedPin}`))?.connectionId }
    : null;
  const diagnostic = explicit || echoFallback;
  if (!diagnostic && !/(error|failed|fail|nan|timeout|brownout|invalid|panic|rst:0x10)/i.test(log)) return null;

  const step = steps.find(({ connectionId }) => connectionId === diagnostic?.connectionId) || null;
  return {
    title: clean(diagnostic?.failureTitle, concreteFailureTitle(log)),
    evidence: concreteEvidence(log),
    recoveryAction: clean(
      diagnostic?.recoveryAction,
      step ? `Check ${wireDescription(step)}, then press RESET and retry.` : "Press the board’s RESET/EN button once, then retry.",
    ),
    connectionId: clean(step?.connectionId),
    connectionNumber: Number(step?.connectionNumber || step?.order || 0),
    wireColor: clean(step?.wireColor),
    fromPrintedPin: clean(step?.fromPrintedPin || step?.from),
    toPrintedPin: clean(step?.toPrintedPin || step?.pin || step?.to),
  };
}

export function expectedDiagnosticHits(logText, tests = []) {
  const log = clean(logText).toLowerCase();
  return tests.filter((test) => {
    const marker = clean(test?.expectedSerial).toLowerCase();
    return marker && log.includes(marker);
  });
}

export function resolveWorkflowStage(requestedIndex, workflow = {}) {
  const requested = Math.max(0, Math.min(4, Number(requestedIndex) || 0));
  if (requested >= 2 && !workflow.hasPlan) return 1;
  if (requested >= 3 && workflow.flashStatus !== "success") return 2;
  if (requested >= 4 && (workflow.automaticTestStatus !== "pass" || workflow.manualTestStatus !== "pass")) return 3;
  return requested;
}

export function wireDescription(step = {}) {
  const color = capitalize(clean(step.wireColor, "wire"));
  const number = Number(step.connectionNumber || step.order || 0);
  const from = clean(step.fromPrintedPin || step.from, "start pin");
  const to = clean(step.toPrintedPin || step.pin || step.to, "target pin");
  return `${color} wire · Connection ${number} · ${from} → ${to}`;
}

function normalizeStep(step = {}, index) {
  const fromPrintedPin = clean(step.fromPrintedPin || endpointPin(step.from), clean(step.from, "START"));
  const toPrintedPin = clean(step.toPrintedPin || step.pin || endpointPin(step.to), clean(step.to, "TARGET"));
  const color = clean(step.wireColor, DEFAULT_WIRE_COLORS[index % DEFAULT_WIRE_COLORS.length]);
  const action = clean(
    step.action || step.instruction,
    `Connect the ${color} wire from ${fromPrintedPin} to ${toPrintedPin}.`,
  );
  return {
    ...step,
    order: finite(step.order, index + 1),
    connectionNumber: finite(step.connectionNumber, finite(step.order, index + 1)),
    connectionId: clean(step.connectionId, `connection-${index + 1}`),
    connectionIdConfirmed: Boolean(clean(step.connectionId)),
    title: clean(step.title, `Connect ${fromPrintedPin} to ${toPrintedPin}`),
    action,
    instruction: action,
    from: clean(step.from),
    to: clean(step.to),
    fromPartId: clean(step.fromPartId),
    toPartId: clean(step.toPartId),
    fromPrintedPin,
    toPrintedPin,
    fromElectricalAlias: clean(step.fromElectricalAlias),
    toElectricalAlias: clean(step.toElectricalAlias),
    pinLocationsConfirmed: step.pinLocationsConfirmed === true,
    fromPinBbox: step.fromPinBbox || null,
    toPinBbox: step.toPinBbox || null,
    pin: toPrintedPin,
    wireColor: color,
    wireType: clean(step.wireType),
    quickCheck: clean(step.quickCheck || step.check, "Both ends feel snug and the printed labels match."),
    check: clean(step.quickCheck || step.check, "Both ends feel snug and the printed labels match."),
    why: clean(step.why),
    warning: clean(step.warning),
    requiredPartIds: Array.isArray(step.requiredPartIds)
      ? step.requiredPartIds.map((value) => clean(value)).filter(Boolean)
      : [clean(step.fromPartId), clean(step.toPartId)].filter(Boolean),
    accessibilityRank: finite(step.accessibilityRank, index + 1),
  };
}

function normalizeBoardProfile(profile = {}) {
  const supportStatus = ["exactly_supported", "compatible_with_differences", "unverified"].includes(
    profile?.supportStatus,
  )
    ? profile.supportStatus
    : "unverified";
  return {
    profileId: clean(profile?.profileId, "unverified-esp32"),
    manufacturer: clean(profile?.manufacturer, "Unknown manufacturer"),
    model: clean(profile?.model, "ESP32 board"),
    revision: clean(profile?.revision, "Unconfirmed revision"),
    supportStatus,
    usbConnector: clean(profile?.usbConnector, "Connector not confirmed"),
    resetLabel: clean(profile?.resetLabel, "RESET / EN"),
    bootLabel: clean(profile?.bootLabel, "BOOT"),
    printedLabels: Array.isArray(profile?.printedLabels)
      ? profile.printedLabels.map((value) => clean(value)).filter(Boolean)
      : [],
  };
}

function normalizePreparation(preparation = {}, wiringSteps = []) {
  const suppliedWires = Array.isArray(preparation?.wires) ? preparation.wires : [];
  const wireByConnection = new Map(suppliedWires.map((wire) => [clean(wire?.connectionId), wire]));
  return {
    orientation: clean(
      preparation?.orientation,
      "Place every component label-side up with the printed pin names visible.",
    ),
    usbCable: clean(preparation?.usbCable, "Use a USB data cable that fits the confirmed board connector."),
    requiredPartIds: Array.isArray(preparation?.requiredPartIds)
      ? preparation.requiredPartIds.map((value) => clean(value)).filter(Boolean)
      : [],
    wires: wiringSteps.map((step) => {
      const supplied = wireByConnection.get(step.connectionId) || {};
      return {
        connectionId: step.connectionId,
        color: clean(supplied.color || step.wireColor),
        connectorType: clean(supplied.connectorType || step.wireType),
        quantity: Math.max(1, finite(supplied.quantity, 1)),
      };
    }),
  };
}

function normalizeOperatingGuide(guide = {}) {
  const steps = Array.isArray(guide?.steps) ? guide.steps.map((value) => clean(value)).filter(Boolean) : [];
  return {
    summary: clean(guide?.summary, "Operate the finished project once, then confirm what you observe."),
    steps: steps.length ? steps : ["Keep the board powered and operate the project once."],
    successQuestion: clean(guide?.successQuestion, "Did the finished project behave as described?"),
    unit: clean(guide?.unit),
    resetInstruction: clean(
      guide?.resetInstruction,
      "If the reading does not update, press the board’s RESET/EN button once—not BOOT—then watch again.",
    ),
  };
}

function endpointPin(value) {
  const text = clean(value);
  const match = text.match(/(?:pin\s*)?([A-Z]{1,5}\d*|\d+)$/i);
  return match?.[1] || "";
}

function canonicalPin(value) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function actionNamesExactPin(action, pin) {
  const expected = canonicalPin(pin);
  if (!expected) return false;
  const tokens = clean(action)
    .toUpperCase()
    .match(/[A-Z0-9]+(?:\.[A-Z0-9]+)*(?:\s+\d+)?/g) || [];
  return tokens.some((token) => canonicalPin(token) === expected);
}

function isConfirmedPinBox(bbox) {
  const normalized = normalizedBox(bbox);
  if (!normalized) return false;
  const { x, y, width, height } = normalized;
  return x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 100 && y + height <= 100 && width <= 20 && height <= 20;
}

function normalizedBox(bbox) {
  if (!bbox || typeof bbox !== "object") return null;
  const values = [bbox.x, bbox.y, bbox.width, bbox.height].map(Number);
  if (!values.every(Number.isFinite)) return null;
  let [x, y, width, height] = values;
  const largest = Math.max(...values.map(Math.abs));
  if (largest <= 1.5) [x, y, width, height] = values.map((value) => value * 100);
  else if (largest > 100 && largest <= 1000) [x, y, width, height] = values.map((value) => value / 10);
  else if (largest > 1000) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) return null;
  return { x, y, width, height };
}

function pinBoxBelongsToPart(pinBbox, partBbox) {
  const pin = normalizedBox(pinBbox);
  const part = normalizedBox(partBbox);
  if (!pin || !part) return false;
  const overlapWidth = Math.max(0, Math.min(pin.x + pin.width, part.x + part.width) - Math.max(pin.x, part.x));
  const overlapHeight = Math.max(0, Math.min(pin.y + pin.height, part.y + part.height) - Math.max(pin.y, part.y));
  const overlapArea = overlapWidth * overlapHeight;
  return overlapArea / (pin.width * pin.height) >= 0.5;
}

function boxesAreEffectivelyIdentical(leftBbox, rightBbox) {
  const left = normalizedBox(leftBbox);
  const right = normalizedBox(rightBbox);
  if (!left || !right) return false;
  return ["x", "y", "width", "height"].every((key) => Math.abs(left[key] - right[key]) < 0.1);
}

function hasConfirmedEchoProtection(echoStep, parts, steps) {
  const partsById = new Map(parts.map((part) => [clean(part?.id), part]).filter(([partId]) => partId));
  const sourcePartId = clean(echoStep.fromPartId);
  const protectionPartId = clean(echoStep.toPartId);
  const sourcePart = partsById.get(sourcePartId);
  const protectionPart = partsById.get(protectionPartId);
  const protectionType = confirmedProtectionType(protectionPart);

  if (!isHcSr04Part(sourcePart) || canonicalPin(echoStep.fromPrintedPin || echoStep.from) !== "ECHO") return false;
  if (!protectionType || !normalizedBox(protectionPart?.bbox)) return false;
  if (!requiredPartsInclude(echoStep, sourcePartId, protectionPartId)) return false;
  if (!stepEndpointsAreConfirmed(echoStep, sourcePart, protectionPart)) return false;
  if (!describesVoltageSide(echoStep, "to", "high")) return false;

  return steps.some((continuation) => {
    if (continuation === echoStep || clean(continuation.fromPartId) !== protectionPartId) return false;
    const boardPartId = clean(continuation.toPartId);
    const boardPart = partsById.get(boardPartId);
    if (!isEsp32Part(boardPart) || !requiredPartsInclude(continuation, protectionPartId, boardPartId)) return false;
    if (!stepEndpointsAreConfirmed(continuation, protectionPart, boardPart)) return false;
    if (!describesVoltageSide(continuation, "from", "low")) return false;
    if (boxesIdentifySameReceptacle(echoStep.toPinBbox, continuation.fromPinBbox)) return false;
    return protectionChannelsMatch(echoStep.toPrintedPin, continuation.fromPrintedPin, protectionType);
  });
}

function confirmedProtectionType(part) {
  const text = partText(part);
  const confidence = Number(part?.confidence);
  const profileId = clean(part?.profileId);
  const compatibilityStatus = clean(part?.compatibilityStatus);
  const explicitlyRated = /5\s*v/i.test(text) && /3(?:\.|\s*)3\s*v/i.test(text);
  const verifiedProfile =
    Number.isFinite(confidence) &&
    confidence >= 0.9 &&
    confidence <= 1 &&
    compatibilityStatus === "exactly_supported" &&
    profileId &&
    !/(?:unverified|unknown|possible|generic)/i.test(profileId);
  if (!verifiedProfile || !explicitlyRated) return "";
  if (/level shifter|logic(?:-level)? converter/i.test(text)) return "level-shifter";
  if (/voltage divider/i.test(text)) {
    return "rated-divider-module";
  }
  return "";
}

function requiredPartsInclude(step, ...partIds) {
  const requiredIds = new Set(
    (Array.isArray(step.requiredPartIds) ? step.requiredPartIds : [])
      .map((value) => clean(value))
      .filter(Boolean),
  );
  return partIds.every((partId) => partId && requiredIds.has(partId));
}

function stepEndpointsAreConfirmed(step, fromPart, toPart) {
  return (
    step.pinLocationsConfirmed === true &&
    isConfirmedPinBox(step.fromPinBbox) &&
    isConfirmedPinBox(step.toPinBbox) &&
    pinBoxBelongsToPart(step.fromPinBbox, fromPart?.bbox) &&
    pinBoxBelongsToPart(step.toPinBbox, toPart?.bbox)
  );
}

function describesVoltageSide(step, endpoint, side) {
  const printedPin = endpoint === "from" ? step.fromPrintedPin || step.from : step.toPrintedPin || step.to;
  const electricalAlias = endpoint === "from" ? step.fromElectricalAlias : step.toElectricalAlias;
  const text = `${printedPin || ""} ${electricalAlias || ""}`;
  const highSide = /\b(?:HV\d*|HIGH(?:[- ]SIDE)?|INPUT|IN\d*)\b|\b5\s*(?:\.0\s*)?V\b/i.test(text);
  const lowSide = /\b(?:LV\d*|LOW(?:[- ]SIDE)?|OUTPUT|OUT\d*|3V3)\b|\b3(?:\.|\s*)3\s*V\b/i.test(text);
  return side === "high" ? highSide && !lowSide : lowSide && !highSide;
}

function boxesIdentifySameReceptacle(leftBbox, rightBbox) {
  const left = normalizedBox(leftBbox);
  const right = normalizedBox(rightBbox);
  if (!left || !right) return true;
  const overlapWidth = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const overlapHeight = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const overlapArea = overlapWidth * overlapHeight;
  const smallerArea = Math.min(left.width * left.height, right.width * right.height);
  const centerDistance = Math.hypot(
    left.x + left.width / 2 - (right.x + right.width / 2),
    left.y + left.height / 2 - (right.y + right.height / 2),
  );
  const minimumCenterSeparation = Math.min(left.width, left.height, right.width, right.height) / 2;
  return overlapArea / smallerArea >= 0.25 || centerDistance < minimumCenterSeparation;
}

function protectionChannelsMatch(highSidePin, lowSidePin, protectionType) {
  const highPin = canonicalProtectionPin(highSidePin);
  const lowPin = canonicalProtectionPin(lowSidePin);
  const highChannel = protectionChannelId(highPin, "high");
  const lowChannel = protectionChannelId(lowPin, "low");

  if (
    protectionType === "rated-divider-module" &&
    !highChannel &&
    !lowChannel &&
    /^(?:IN|INPUT|HV)$/.test(highPin) &&
    /^(?:OUT|OUTPUT|LV)$/.test(lowPin)
  ) {
    return true;
  }
  return Boolean(highChannel && lowChannel && highChannel === lowChannel);
}

function canonicalProtectionPin(pin) {
  return canonicalPin(pin).replace(/[^A-Z0-9]/g, "");
}

function protectionChannelId(pin, side) {
  const withoutSide = side === "high"
    ? pin.replace(/^(?:HIGHSIDE|HIGH|HV|INPUT|IN)/, "")
    : pin.replace(/^(?:LOWSIDE|LOW|LV|OUTPUT|OUT)/, "");
  if (withoutSide && withoutSide !== pin) return withoutSide;
  return pin.match(/\d+$/)?.[0] || "";
}

function isHcSr04Part(part) {
  return /hc[- ]?sr04|ultrasonic/i.test(partText(part));
}

function isEsp32Part(part) {
  return /esp32/i.test(partText(part));
}

function partText(part = {}) {
  return `${part.name || ""} ${part.type || ""} ${part.role || ""}`.trim();
}

function displayPin(value) {
  return /^GPIO\d+$/.test(value) ? value.replace("GPIO", "GPIO ") : value;
}

function concreteFailureTitle(log) {
  if (/echo/.test(log)) return "The ultrasonic ECHO signal was not detected.";
  if (/brownout/.test(log)) return "The board reported a power drop.";
  if (/timeout/.test(log)) return "The expected board message did not arrive in time.";
  if (/nan/.test(log)) return "A sensor returned a reading that is not a number.";
  return "The board reported an error that needs a specific repair.";
}

function concreteEvidence(log) {
  const line = log
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => /(error|failed|fail|nan|timeout|brownout|invalid|panic|echo)/i.test(value));
  return line ? `Board message: “${line.slice(0, 180)}”` : "The expected diagnostic marker was not present.";
}

function issue(severity, code, message, connectionId = "") {
  return { severity, code, message, connectionId };
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((entry) => {
    const key = `${entry.code}:${entry.message}:${entry.connectionId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clean(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function capitalize(value) {
  const text = clean(value);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
}
