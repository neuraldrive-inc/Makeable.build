export const PLAN_SCHEMA_VERSION = 1;
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_IMAGE_MAX_SIDE = 1800;
export const DEFAULT_IMAGE_QUALITY = 0.86;

const BOUNDS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
  },
  required: ["x", "y", "width", "height"],
});

const PART_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    type: { type: "string" },
    role: { type: "string" },
    confidence: { type: "number" },
    bounds: BOUNDS_SCHEMA,
  },
  required: ["id", "name", "type", "role", "confidence", "bounds"],
});

const MISSING_PART_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    reason: { type: "string" },
    searchTerms: { type: "array", items: { type: "string" } },
    compatibleWith: { type: "array", items: { type: "string" } },
  },
  required: ["id", "name", "reason", "searchTerms", "compatibleWith"],
});

const ALTERNATIVE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    requiredPartIds: { type: "array", items: { type: "string" } },
  },
  required: ["id", "title", "summary", "requiredPartIds"],
});

const WIRING_STEP_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    order: { type: "integer" },
    title: { type: "string" },
    instruction: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    fromPartId: { type: "string" },
    toPartId: { type: "string" },
    pin: { type: "string" },
    wireColor: { type: "string" },
    check: { type: "string" },
  },
  required: [
    "order",
    "title",
    "instruction",
    "from",
    "to",
    "fromPartId",
    "toPartId",
    "pin",
    "wireColor",
    "check",
  ],
});

const FIRMWARE_SPEC_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    board: { type: "string" },
    behavior: { type: "string" },
    libraries: { type: "array", items: { type: "string" } },
    pinAssignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          gpio: { type: "integer" },
          mode: { type: "string" },
          purpose: { type: "string" },
        },
        required: ["label", "gpio", "mode", "purpose"],
      },
    },
    serialProtocol: { type: "array", items: { type: "string" } },
  },
  required: ["board", "behavior", "libraries", "pinAssignments", "serialProtocol"],
});

const FIRMWARE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    language: { type: "string" },
    sketch: { type: "string" },
    notes: { type: "string" },
  },
  required: ["language", "sketch", "notes"],
});

const DIAGNOSTIC_TEST_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    kind: {
      type: "string",
      enum: ["board", "sensor", "actuator", "power"],
    },
    pulseMs: { type: "integer" },
    assemblyStep: { type: "integer" },
  },
  required: ["id", "name", "kind", "pulseMs", "assemblyStep"],
});

export const HARDWARE_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    projectTitle: { type: "string" },
    summary: { type: "string" },
    parts: { type: "array", items: PART_SCHEMA },
    feasibility: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["ready", "missing"] },
        reasons: { type: "array", items: { type: "string" } },
      },
      required: ["status", "reasons"],
    },
    missingParts: { type: "array", items: MISSING_PART_SCHEMA },
    alternatives: { type: "array", items: ALTERNATIVE_SCHEMA },
    wiringSteps: { type: "array", items: WIRING_STEP_SCHEMA },
    firmwareSpec: FIRMWARE_SPEC_SCHEMA,
    firmware: FIRMWARE_SCHEMA,
    diagnostics: {
      type: "object",
      additionalProperties: false,
      properties: {
        warnings: { type: "array", items: { type: "string" } },
        tests: { type: "array", items: DIAGNOSTIC_TEST_SCHEMA },
        manualAction: { type: "string" },
        manualQuestion: { type: "string" },
        manualSuccessLabel: { type: "string" },
      },
      required: [
        "warnings",
        "tests",
        "manualAction",
        "manualQuestion",
        "manualSuccessLabel",
      ],
    },
  },
  required: [
    "projectTitle",
    "summary",
    "parts",
    "feasibility",
    "missingParts",
    "alternatives",
    "wiringSteps",
    "firmwareSpec",
    "firmware",
    "diagnostics",
  ],
});

export function normalizeHardwarePlan(raw = {}, options = {}) {
  const usedIds = new Set();
  const parts = array(raw.parts).map((part, index) => {
    const id = uniqueId(part?.id || part?.name || `part-${index + 1}`, usedIds);
    const confidence = normalizeConfidence(part?.confidence);
    const lowConfidence = confidence < LOW_CONFIDENCE_THRESHOLD;
    const explicitBounds = part?.bounds;
    return {
      id,
      name: cleanText(part?.name, `Part ${index + 1}`),
      type: cleanText(part?.type, "component"),
      role: cleanText(part?.role, "Project part"),
      confidence,
      bounds: normalizeBounds(explicitBounds || part?.bbox, {
        thousandScale: !explicitBounds,
      }),
      lowConfidence,
      confirmed:
        typeof part?.confirmed === "boolean" ? part.confirmed : !lowConfidence,
    };
  });
  const status = normalizeFeasibilityStatus(raw.feasibility?.status);
  const lowConfidencePartIds = parts
    .filter(({ lowConfidence, confirmed }) => lowConfidence && !confirmed)
    .map(({ id }) => id);
  const requestId = cleanText(options.requestId, "");

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    projectTitle: cleanText(raw.projectTitle, "Makeable project"),
    summary: cleanText(raw.summary, ""),
    parts,
    feasibility: {
      status,
      reasons: textArray(raw.feasibility?.reasons || raw.feasibilityReasons),
    },
    missingParts: array(raw.missingParts).map((part, index) => ({
      id: slug(part?.id || part?.name || `missing-${index + 1}`),
      name: cleanText(part?.name, `Missing part ${index + 1}`),
      reason: cleanText(part?.reason, ""),
      searchTerms: textArray(part?.searchTerms),
      compatibleWith: textArray(part?.compatibleWith).map(slug),
      obtained: Boolean(part?.obtained),
    })),
    alternatives: array(raw.alternatives).map((alternative, index) => ({
      id: slug(alternative?.id || alternative?.title || `alternative-${index + 1}`),
      title: cleanText(alternative?.title, `Alternative ${index + 1}`),
      summary: cleanText(alternative?.summary, ""),
      requiredPartIds: textArray(alternative?.requiredPartIds).map(slug),
    })),
    wiringSteps: array(raw.wiringSteps).map(normalizeWiringStep),
    firmwareSpec: normalizeFirmwareSpec(raw.firmwareSpec),
    firmware: raw.firmware ? normalizeFirmware(raw.firmware) : null,
    diagnostics: {
      schemaVersion: PLAN_SCHEMA_VERSION,
      requestId,
      warnings: textArray(raw.diagnostics?.warnings || raw.warnings),
      partCount: parts.length,
      lowConfidencePartIds,
      tests: normalizeDiagnosticTests(
        raw.diagnostics?.tests || raw.diagnosticTests,
      ),
      manualAction: cleanText(
        raw.diagnostics?.manualAction,
        cleanText(
          raw.firmwareSpec?.behavior,
          "Perform the project’s real-world action and watch what happens.",
        ),
      ),
      manualQuestion: cleanText(
        raw.diagnostics?.manualQuestion,
        "Did the project respond as expected?",
      ),
      manualSuccessLabel: cleanText(
        raw.diagnostics?.manualSuccessLabel,
        "Yes, it worked",
      ),
    },
  };
}

export function normalizeBounds(raw, options = {}) {
  if (!raw || !["x", "y", "width", "height"].every((key) => Number.isFinite(Number(raw[key])))) {
    return null;
  }
  let x = Number(raw.x);
  let y = Number(raw.y);
  let width = Number(raw.width);
  let height = Number(raw.height);
  const largest = Math.max(Math.abs(x), Math.abs(y), Math.abs(width), Math.abs(height));
  if (largest <= 1.5) {
    x *= 100;
    y *= 100;
    width *= 100;
    height *= 100;
  } else if (options.thousandScale && largest > 100 && largest <= 1000) {
    x /= 10;
    y /= 10;
    width /= 10;
    height /= 10;
  }
  x = round(clamp(x, 0, 100));
  y = round(clamp(y, 0, 100));
  width = round(clamp(width, 0, 100 - x));
  height = round(clamp(height, 0, 100 - y));
  return { x, y, width, height };
}

export function updateDetectedPart(parts, partId, patch = {}) {
  return array(parts).map((part) => {
    if (part.id !== partId) return part;
    const next = {
      ...part,
      ...patch,
      id: part.id,
    };
    if (patch.bounds) next.bounds = normalizeBounds(patch.bounds);
    if ("name" in patch) next.name = cleanText(patch.name, part.name);
    if ("confirmed" in patch) next.confirmed = Boolean(patch.confirmed);
    return next;
  });
}

export function canConfirmParts(parts) {
  return (
    array(parts).length > 0 &&
    array(parts).every(
      ({ lowConfidence, confirmed }) => !lowConfidence || Boolean(confirmed),
    )
  );
}

export function calculateContainedImageFrame(container, image) {
  const containerWidth = Math.max(0, Number(container?.width) || 0);
  const containerHeight = Math.max(0, Number(container?.height) || 0);
  const imageWidth = Math.max(0, Number(image?.width) || 0);
  const imageHeight = Math.max(0, Number(image?.height) || 0);
  if (!containerWidth || !containerHeight || !imageWidth || !imageHeight) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function acquireMissingPart(project, partId) {
  const feasibility = project?.feasibility;
  const missingParts = array(feasibility?.missingParts);
  const acquired = missingParts.find((part) => part.id === partId);
  if (!acquired) return project;

  const updatedMissing = missingParts.map((part) =>
    part.id === partId ? { ...part, obtained: true } : part,
  );
  const confirmedParts = array(project.confirmedParts);
  const inventory = confirmedParts.some((part) => part.id === acquired.id)
    ? confirmedParts
    : [
        ...confirmedParts,
        {
          id: acquired.id,
          name: cleanText(acquired.name, "Acquired part"),
          type: "acquired-part",
          role: "Required project part",
          confidence: 1,
          lowConfidence: false,
          confirmed: true,
          bounds: null,
        },
      ];
  const ready = updatedMissing.every(({ obtained }) => obtained);

  return {
    ...project,
    confirmedParts: inventory,
    feasibility: {
      ...feasibility,
      status: ready ? "ready" : "missing",
      reasons: ready ? [] : array(feasibility?.reasons),
      missingParts: ready ? [] : updatedMissing,
    },
  };
}

export function createObjectUrlRegistry({
  createObjectURL = globalThis.URL?.createObjectURL?.bind(globalThis.URL),
  revokeObjectURL = globalThis.URL?.revokeObjectURL?.bind(globalThis.URL),
} = {}) {
  if (!createObjectURL || !revokeObjectURL) {
    throw new TypeError("Object URL support is unavailable.");
  }
  const entries = new Map();
  const revoke = (role) => {
    const current = entries.get(role);
    if (!current) return;
    revokeObjectURL(current.url);
    entries.delete(role);
  };
  return Object.freeze({
    get(role, key) {
      const current = entries.get(role);
      return current?.key === key ? current.url : "";
    },
    replace(role, key, blob) {
      const current = entries.get(role);
      if (current?.key === key) return current.url;
      revoke(role);
      const url = createObjectURL(blob);
      entries.set(role, { key, url });
      return url;
    },
    revoke,
    revokeAll() {
      for (const role of [...entries.keys()]) revoke(role);
    },
  });
}

export async function normalizeImageFile(file, options = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new TypeError("Choose a JPG, PNG, HEIC, or WebP image.");
  }
  const maxSide = positiveNumber(options.maxSide, DEFAULT_IMAGE_MAX_SIDE);
  const quality = clamp(
    positiveNumber(options.quality, DEFAULT_IMAGE_QUALITY),
    0.1,
    1,
  );
  const bitmapFactory =
    options.createImageBitmap || globalThis.createImageBitmap?.bind(globalThis);
  if (!bitmapFactory) throw new Error("This browser cannot prepare images.");
  const source = await bitmapFactory(file, { imageOrientation: "from-image" });
  const sourceWidth = Number(source.width || source.naturalWidth);
  const sourceHeight = Number(source.height || source.naturalHeight);
  if (!sourceWidth || !sourceHeight) {
    source.close?.();
    throw new Error("The selected image has no readable dimensions.");
  }
  const scale = Math.min(1, maxSide / sourceWidth, maxSide / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = options.createCanvas
    ? options.createCanvas(width, height)
    : createBrowserCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    source.close?.();
    throw new Error("This browser cannot compress images.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  source.close?.();
  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: "image/jpeg", quality })
    : await new Promise((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error("Image compression failed.")),
          "image/jpeg",
          quality,
        ),
      );
  return {
    blob,
    width,
    height,
    mimeType: "image/jpeg",
    originalName: cleanText(file.name, "photo"),
  };
}

export function createPartSearchUrl(part, confirmedParts = []) {
  const inventoryNames = new Map(
    array(confirmedParts).map(({ id, name }) => [slug(id), cleanText(name, "")]),
  );
  const compatibleNames = textArray(part?.compatibleWith)
    .map((id) => inventoryNames.get(slug(id)))
    .filter(Boolean);
  const query = [
    cleanText(part?.name, "electronics part"),
    ...textArray(part?.searchTerms),
    ...compatibleNames.map((name) => `compatible with ${name}`),
  ]
    .filter(Boolean)
    .join(" ");
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  return url.href;
}

export function inventoryCompatibleAlternatives(alternatives, confirmedParts) {
  const inventory = new Set(array(confirmedParts).map(({ id }) => slug(id)));
  return array(alternatives).filter(({ requiredPartIds }) =>
    textArray(requiredPartIds).every((id) => inventory.has(slug(id))),
  );
}

export async function requestHardwarePlan({
  idea,
  imageDataUrl,
  confirmedParts,
  fetchImpl = globalThis.fetch,
  model = globalThis.MAKEABLE_CONFIG?.openaiModel || "gpt-5.5",
}) {
  const confirmation = Array.isArray(confirmedParts);
  const userContent = confirmation
    ? [
        {
          type: "input_text",
          text: [
            `Project idea: ${idea}`,
            "Regenerate the beginner-safe guide and firmware from this confirmed inventory.",
            "Treat this as the confirmed inventory; do not re-identify or add photographed parts.",
            JSON.stringify(confirmedParts),
            "Return honest feasibility, missing parts, compatible alternatives, wiring, firmware, and stable diagnostics.",
            firmwareDiagnosticRequirements(),
            "Never invent prices, sellers, stock, or checkout.",
          ].join("\n\n"),
        },
      ]
    : [
        {
          type: "input_text",
          text: [
            `Project idea: ${idea}`,
            "Identify only actual visible parts needed for the idea.",
            "Use tight 0-100 percentage bounds and conservative confidence.",
            "Return honest feasibility, missing parts, inventory-compatible alternatives, and stable diagnostics.",
            firmwareDiagnosticRequirements(),
            "Do not invent prices, sellers, stock, or checkout.",
          ].join("\n\n"),
        },
        { type: "input_image", image_url: imageDataUrl, detail: "high" },
      ];
  const payload = {
    model,
    input: [
      {
        role: "system",
        content: confirmation
          ? "You are Makeable's hardware planner. Regenerate a safe guide and compile-ready firmware from confirmed parts. Return only schema-valid JSON."
          : "You are Makeable's visual hardware planner. Identify visible components conservatively. Return only schema-valid JSON.",
      },
      { role: "user", content: userContent },
    ],
    text: {
      format: {
        type: "json_schema",
        name: confirmation ? "confirmed_hardware_plan" : "detected_hardware_plan",
        strict: true,
        schema: HARDWARE_PLAN_SCHEMA,
      },
    },
  };
  const response = await fetchImpl("/api/openai/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      cleanText(data?.error?.message || data?.error || data?.message, "The plan could not be created."),
    );
  }
  const plan = normalizeHardwarePlan(parseResponsePayload(data), {
    requestId: data?.id,
  });
  if (confirmation) assertFirmwareDiagnosticContract(plan.firmware?.sketch);
  return plan;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });
}

export function ideaText(idea) {
  return typeof idea === "string" ? idea : cleanText(idea?.text, "");
}

export function advanceAssembly(wiring = {}) {
  const steps = array(wiring.steps);
  const currentStep = clamp(
    Number.isInteger(wiring.currentStep) ? wiring.currentStep : 0,
    0,
    Math.max(0, steps.length - 1),
  );
  const completedSteps = new Set(
    array(wiring.completedSteps).filter(
      (index) => Number.isInteger(index) && index >= 0 && index < steps.length,
    ),
  );
  if (steps.length) completedSteps.add(currentStep);
  return {
    ...wiring,
    currentStep: Math.min(currentStep + 1, Math.max(0, steps.length - 1)),
    completedSteps: [...completedSteps].sort((left, right) => left - right),
  };
}

export function selectAssemblyStep(wiring = {}, requestedStep) {
  const steps = array(wiring.steps);
  if (!steps.length) return { ...wiring, currentStep: 0, completedSteps: [] };
  const completedSteps = array(wiring.completedSteps);
  const firstIncomplete = steps.findIndex((_step, index) => !completedSteps.includes(index));
  const furthestAvailable =
    firstIncomplete === -1 ? steps.length - 1 : Math.min(firstIncomplete, steps.length - 1);
  return {
    ...wiring,
    currentStep: clamp(Number(requestedStep) || 0, 0, furthestAvailable),
    completedSteps: [...completedSteps],
  };
}

export function isAssemblyComplete(wiring = {}) {
  const steps = array(wiring.steps);
  return (
    steps.length > 0 &&
    steps.every((_step, index) => array(wiring.completedSteps).includes(index))
  );
}

export function createSerialMarkerParser() {
  let carry = "";
  return Object.freeze({
    push(chunk) {
      carry = `${carry}${String(chunk || "")}`.slice(-25_000);
      const lines = carry.split(/\r?\n/);
      carry = lines.pop() || "";
      return lines.map(parseSerialMarker).filter(Boolean);
    },
    flush() {
      const marker = parseSerialMarker(carry);
      carry = "";
      return marker ? [marker] : [];
    },
  });
}

export function createSafeDiagnosticCommand(diagnostic = {}) {
  const id = String(diagnostic.id || "");
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) {
    throw new TypeError("A safe diagnostic id is required.");
  }
  const pulseMs =
    diagnostic.kind === "actuator"
      ? clamp(Math.round(Number(diagnostic.pulseMs) || 500), 100, 1000)
      : 0;
  return `MAKEABLE|RUN|${id}|${pulseMs}\n`;
}

export function inferPowerStatus(markers, observationComplete, evidence) {
  const reset = array(markers).find(
    (marker) =>
      marker?.type === "reset" &&
      /brownout|reset|panic|watchdog/i.test(String(marker.reason || marker.raw || "")),
  );
  if (reset) {
    return {
      status: "fail",
      detail: /brownout/i.test(String(reset.reason || reset.raw || ""))
        ? "The board reported a brownout reset."
        : "The board restarted during the power observation.",
    };
  }
  if (!observationComplete) {
    return {
      status: "waiting",
      detail: "Watching for reset or brownout evidence.",
    };
  }
  if (!evidence) {
    return {
      status: "fail",
      detail: "The power observation did not include serial session health evidence.",
    };
  }
  if (!evidence.sessionHealthy) {
    return {
      status: "fail",
      detail: "The serial connection ended during the power observation.",
    };
  }
  return {
    status: "pass",
    detail: "No reset or brownout markers appeared during the observation window.",
  };
}

export async function runSequentialDiagnostics({
  diagnostics,
  session,
  onStatus = () => {},
  signal,
} = {}) {
  if (!session) throw new TypeError("A serial diagnostic session is required.");
  const checks = normalizeDiagnosticTests(diagnostics).map((check) => ({
    ...check,
    status: "waiting",
    detail: "",
  }));
  const publish = () => onStatus(checks.map((check) => ({ ...check })));
  publish();
  try {
    for (const check of checks) {
      throwIfAborted(signal);
      check.status = "running";
      check.detail =
        check.kind === "power"
          ? "Watching for resets and brownouts."
          : `Waiting for the ${check.name.toLowerCase()} marker.`;
      publish();

      if (check.kind === "power") {
        const observation = await session.observePower?.({
          durationMs: 2500,
          signal,
        });
        const markers = Array.isArray(observation)
          ? observation
          : observation?.markers;
        Object.assign(
          check,
          inferPowerStatus(markers, true, Array.isArray(observation) ? null : observation),
        );
      } else {
        if (check.kind !== "board") {
          await session.write(createSafeDiagnosticCommand(check));
        }
        const marker = await session.waitForMarker(
          (candidate) =>
            check.kind === "board"
              ? candidate?.type === "ready"
              : candidate?.type === "check" && candidate.id === check.id,
          { timeoutMs: 6000, signal },
        );
        if (!marker) {
          check.status = "fail";
          check.detail = "The expected board marker did not arrive.";
        } else if (marker.type === "check" && marker.status !== "pass") {
          check.status = "fail";
          check.detail = cleanText(marker.detail, "The board reported a failed check.");
        } else {
          check.status = "pass";
          check.detail =
            marker.type === "ready"
              ? `Board found: ${cleanText(marker.board, "connected board")}`
              : cleanText(marker.detail, "Expected marker received.");
        }
      }
      publish();
      if (check.status === "fail") break;
    }
  } catch (error) {
    const running = checks.find(({ status }) => status === "running");
    if (running) {
      running.status = signal?.aborted ? "stopped" : "fail";
      running.detail = signal?.aborted
        ? "The automatic check was stopped."
        : cleanText(error?.message, "The check could not finish.");
      publish();
    }
  } finally {
    await session.close?.();
  }
  return {
    status: checks.length > 0 && checks.every(({ status }) => status === "pass")
      ? "pass"
      : checks.some(({ status }) => status === "stopped")
        ? "stopped"
        : "fail",
    checks,
    serialOutput: String(session.serialOutput || "").slice(-25_000),
  };
}

export async function createDiagnosticSession({
  serial = globalThis.navigator?.serial,
  onText = () => {},
  baudRate = 115200,
} = {}) {
  if (!serial?.requestPort) {
    throw new Error(
      "This browser can’t listen to the board. Use Chrome or Edge on desktop.",
    );
  }
  const port = await serial.requestPort({ filters: ESP_SERIAL_FILTERS });
  await port.open({ baudRate });
  const reader = port.readable?.getReader();
  const decoder = new TextDecoder();
  const parser = createSerialMarkerParser();
  const markers = [];
  const consumed = new Set();
  const waiters = new Set();
  let output = "";
  let closed = false;
  let readEnded = false;
  let readError = null;

  const notify = (marker) => {
    markers.push(marker);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(marker)) continue;
      consumed.add(marker);
      clearTimeout(waiter.timeout);
      waiters.delete(waiter);
      waiter.resolve(marker);
    }
  };
  const readLoop = (async () => {
    if (!reader) return;
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) {
          if (!closed) readEnded = true;
          break;
        }
        if (!value) continue;
        const text = decoder.decode(value, { stream: true });
        output = `${output}${text}`.slice(-25_000);
        onText(text);
        parser.push(text).forEach(notify);
      }
    } catch (error) {
      if (!closed) {
        readError = error;
        onText(`\n[serial read stopped] ${error.message}\n`);
      }
    }
  })();

  return Object.freeze({
    get serialOutput() {
      return output;
    },
    async write(command) {
      const writer = port.writable?.getWriter();
      if (!writer) throw new Error("The board serial connection is read-only.");
      try {
        await writer.write(new TextEncoder().encode(command));
      } finally {
        writer.releaseLock();
      }
    },
    async waitForMarker(predicate, { timeoutMs = 6000, signal } = {}) {
      const existing = markers.find(
        (marker) => !consumed.has(marker) && predicate(marker),
      );
      if (existing) {
        consumed.add(existing);
        return existing;
      }
      throwIfAborted(signal);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          reject,
          timeout: setTimeout(() => {
            waiters.delete(waiter);
            resolve(null);
          }, timeoutMs),
        };
        waiters.add(waiter);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(waiter.timeout);
            waiters.delete(waiter);
            reject(abortError());
          },
          { once: true },
        );
      });
    },
    async observePower({ durationMs = 2500, signal } = {}) {
      const startingIndex = markers.length;
      const startedAt = Date.now();
      await abortableDelay(durationMs, signal);
      return {
        markers: markers.slice(startingIndex),
        observedMs: Date.now() - startedAt,
        sessionHealthy: Boolean(reader) && !readEnded && !readError && !closed,
        error: readError?.message || "",
      };
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.resolve(null);
      }
      waiters.clear();
      try {
        await reader?.cancel();
        await readLoop;
      } finally {
        reader?.releaseLock();
        await port.close?.();
      }
    },
  });
}

export async function compileAndFlashFirmware({
  sketch,
  fqbn = "esp32:esp32:esp32",
  erase = false,
  serial = globalThis.navigator?.serial,
  fetchImpl = globalThis.fetch,
  loadEsptool = () =>
    import("https://unpkg.com/esptool-js@0.5.7/bundle.js"),
  onProgress = () => {},
  signal,
} = {}) {
  if (!String(sketch || "").trim()) {
    throw new Error("There isn’t code to load yet.");
  }
  assertFirmwareDiagnosticContract(sketch);
  const statusResponse = await fetchImpl("/api/arduino/status", { signal });
  const status = await safeJson(statusResponse);
  if (!statusResponse.ok || status.hostedMode) {
    throw new Error(
      status.message ||
        "This hosted version can write the code, but loading a board needs the local Makeable server.",
    );
  }
  if (!status.hasArduinoCli || !status.hasEsp32Core) {
    throw new Error(
      "Arduino CLI or the ESP32 boards core is missing. Install it, then retry.",
    );
  }
  if (!serial?.requestPort) {
    throw new Error(
      "This browser can’t talk to the board. Use Chrome or Edge on desktop.",
    );
  }

  onProgress({ phase: "select", percent: 0, label: "Choose your board" });
  const port = await serial.requestPort({ filters: ESP_SERIAL_FILTERS });
  throwIfAborted(signal);
  onProgress({ phase: "compile", percent: 5, label: "Preparing code" });
  const compileResponse = await fetchImpl("/api/firmware/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sketch: String(sketch), fqbn }),
    signal,
  });
  const compiled = await safeJson(compileResponse);
  if (!compileResponse.ok || !array(compiled.images).length) {
    throw new Error(
      compiled.hint ||
        compiled.error ||
        "The code did not compile into a flashable ESP32 image.",
    );
  }

  const esptool = await loadEsptool();
  const transport = new esptool.Transport(port, true);
  let disconnected = false;
  const disconnectTransport = async () => {
    if (disconnected) return;
    disconnected = true;
    await transport.disconnect();
  };
  let boardName = "";
  try {
    const loader = new esptool.ESPLoader({
      transport,
      baudrate: 115200,
      terminal: {
        clean() {},
        write() {},
        writeLine() {},
      },
      debugLogging: false,
    });
    throwIfAborted(signal);
    boardName = cleanText(
      await runAbortableHardwareOperation(
        loader.main("default_reset"),
        signal,
        disconnectTransport,
      ),
      "",
    );
    const images = array(compiled.images);
    const imageWeights = images.map((image) =>
      Math.max(1, Number(image.size) || 1),
    );
    const totalWeight = imageWeights.reduce((sum, value) => sum + value, 0);
    await runAbortableHardwareOperation(loader.writeFlash({
      fileArray: images.map((image) => ({
        data: base64ToBinaryString(image.dataBase64),
        address: image.address,
      })),
      flashMode: "dio",
      flashFreq: "40m",
      flashSize: "4MB",
      eraseAll: Boolean(erase),
      compress: true,
      reportProgress(fileIndex, written, total) {
        const previousWeight = imageWeights
          .slice(0, fileIndex)
          .reduce((sum, value) => sum + value, 0);
        const currentWeight = imageWeights[fileIndex] || 1;
        const currentRatio = total
          ? clamp(Number(written) / Number(total), 0, 1)
          : 0;
        const percent = Math.round(
          ((previousWeight + currentWeight * currentRatio) / totalWeight) * 100,
        );
        const image = images[fileIndex] || images[0];
        onProgress({
          phase: "flash",
          percent,
          label: `${image?.label || image?.name || "Firmware"} ${percent}%`,
        });
      },
    }), signal, disconnectTransport);
    throwIfAborted(signal);
    await loader.after("hard_reset");
    onProgress({ phase: "complete", percent: 100, label: "Code loaded" });
  } finally {
    await disconnectTransport();
  }
  return {
    boardName: boardName || cleanText(status.boardName, "ESP32"),
    fqbn: cleanText(compiled.fqbn, fqbn),
    compilerOutput: cleanText(compiled.stderr || compiled.stdout, ""),
  };
}

export function transitionFirmwareFlash(firmware = {}, status, details = {}) {
  if (!["pending", "success", "failed", "cancelled"].includes(status)) {
    throw new TypeError(`Unknown firmware flash status: ${status}`);
  }
  const flash = { status };
  if (status === "pending" && cleanText(details.fqbn, "")) {
    flash.fqbn = cleanText(details.fqbn, "");
  }
  if (status === "success") {
    flash.boardName = cleanText(details.boardName, "ESP32");
    flash.fqbn = cleanText(details.fqbn, "esp32:esp32:esp32");
    flash.flashedAt = cleanText(details.flashedAt, new Date().toISOString());
  }
  if (["failed", "cancelled"].includes(status)) {
    flash.error = cleanText(
      details.error,
      status === "cancelled" ? "Loading was cancelled." : "Loading failed.",
    );
  }
  return { ...firmware, flash };
}

export function hasFirmwareDiagnosticContract(sketch) {
  const source = stripCppComments(sketch);
  const emits = (marker) =>
    new RegExp(
      `Serial\\s*\\.\\s*(?:print|println|printf)\\s*\\(\\s*["']MAKEABLE\\|${marker}\\|`,
      "i",
    ).test(source);
  const handlesRun =
    /(?:startsWith|indexOf)\s*\(\s*["']MAKEABLE\|RUN\|/i.test(source) ||
    /strncmp\s*\([^,\n]+,\s*["']MAKEABLE\|RUN\|/i.test(source);
  return (
    emits("READY") &&
    emits("CHECK") &&
    emits("RESET") &&
    handlesRun
  );
}

export function assertFirmwareDiagnosticContract(sketch) {
  if (hasFirmwareDiagnosticContract(sketch)) return true;
  throw new Error(
    "Firmware must emit MAKEABLE READY, CHECK, and RESET markers and handle the safe RUN command contract.",
  );
}

export async function evaluateManualTest({
  projectTitle,
  requestedAction,
  imageDataUrl,
  serialOutput,
  fetchImpl = globalThis.fetch,
  model = globalThis.MAKEABLE_CONFIG?.openaiReasoningModel || "gpt-5.5",
} = {}) {
  if (!imageDataUrl) throw new Error("Capture one camera frame first.");
  const payload = {
    model,
    input: [
      {
        role: "system",
        content:
          "You conservatively evaluate beginner electronics from the requested action, one current camera frame, and recent serial markers. Do not infer success from the request alone. Return only schema-valid JSON.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Project: ${cleanText(projectTitle, "Makeable project")}`,
              `Requested real-world action: ${cleanText(requestedAction, "Observe the requested behavior.")}`,
              `Recent serial output:\n${String(serialOutput || "No serial output captured.").slice(-3000)}`,
              "Judge only the visible and serial evidence. Give one actionable next step.",
            ].join("\n\n"),
          },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "makeable_manual_test",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: {
              type: "string",
              enum: ["pass", "needs_attention", "fail", "uncertain"],
            },
            observations: { type: "array", items: { type: "string" } },
            nextStep: { type: "string" },
          },
          required: ["status", "observations", "nextStep"],
        },
      },
    },
  };
  const response = await fetchImpl("/api/openai/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      cleanText(data?.error?.message || data?.error, "The evidence check could not finish."),
    );
  }
  const evaluation = parseResponsePayload(data);
  return {
    responseId: cleanText(data.id, ""),
    status: ["pass", "needs_attention", "fail", "uncertain"].includes(
      evaluation.status,
    )
      ? evaluation.status
      : "uncertain",
    observations: textArray(evaluation.observations),
    nextStep: cleanText(
      evaluation.nextStep,
      "Check the related connection and try again.",
    ),
  };
}

function parseResponsePayload(data) {
  const text =
    (typeof data?.output_text === "string" && data.output_text) ||
    array(data?.output)
      .flatMap((item) => array(item?.content))
      .map((content) => content?.text || content?.value || "")
      .join("\n");
  if (!text) throw new Error("The AI response did not include a hardware plan.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The AI response contained an invalid hardware plan.");
  }
}

function normalizeWiringStep(step, index) {
  return {
    order: Number.isInteger(step?.order) ? step.order : index + 1,
    title: cleanText(step?.title, `Connection ${index + 1}`),
    instruction: cleanText(step?.instruction, ""),
    from: cleanText(step?.from, ""),
    to: cleanText(step?.to, ""),
    fromPartId: slug(step?.fromPartId),
    toPartId: slug(step?.toPartId),
    pin: cleanText(step?.pin, ""),
    wireColor: cleanText(step?.wireColor, ""),
    check: cleanText(step?.check, ""),
    explanation: cleanText(step?.explanation, step?.instruction || ""),
  };
}

function normalizeDiagnosticTests(diagnostics) {
  const usedIds = new Set();
  return array(diagnostics).map((diagnostic, index) => {
    const id = uniqueId(
      diagnostic?.id || diagnostic?.name || `check-${index + 1}`,
      usedIds,
    );
    const kind = ["board", "sensor", "actuator", "power"].includes(
      diagnostic?.kind,
    )
      ? diagnostic.kind
      : "sensor";
    return {
      id,
      name: cleanText(diagnostic?.name, `Hardware check ${index + 1}`),
      kind,
      pulseMs:
        kind === "actuator"
          ? clamp(
              Math.round(Number(diagnostic?.pulseMs) || 500),
              100,
              1000,
            )
          : 0,
      assemblyStep: Math.max(
        1,
        Math.round(Number(diagnostic?.assemblyStep) || 1),
      ),
    };
  });
}

function firmwareDiagnosticRequirements() {
  return [
    "The firmware sketch must implement Makeable’s complete serial diagnostic contract.",
    'Emit `MAKEABLE|RESET|<reason>` from setup using the ESP32 reset reason, then emit `MAKEABLE|READY|<detected board>`.',
    'Emit `MAKEABLE|CHECK|<id>|PASS|<detail>` or `MAKEABLE|CHECK|<id>|FAIL|<detail>` for every diagnostic.',
    'Read newline-delimited serial input, handle only `MAKEABLE|RUN|<id>|<pulseMs>`, reject unknown IDs, and clamp actuator pulses to at most 1000 ms.',
    "Do not place these markers only in comments; print them through Serial and parse the RUN prefix in executable code.",
  ].join(" ");
}

function stripCppComments(source) {
  return String(source || "").replace(
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (_match, literal) => literal || "",
  );
}

function parseSerialMarker(line) {
  const raw = String(line || "").trim();
  if (!raw.startsWith("MAKEABLE|")) return null;
  const [prefix, type, ...fields] = raw.split("|");
  if (prefix !== "MAKEABLE") return null;
  if (type === "READY" && fields[0]) {
    return { type: "ready", board: cleanText(fields.join("|"), "board"), raw };
  }
  if (
    type === "CHECK" &&
    /^[a-z0-9][a-z0-9-]{0,47}$/.test(fields[0] || "") &&
    /^(PASS|FAIL)$/.test(fields[1] || "")
  ) {
    return {
      type: "check",
      id: fields[0],
      status: fields[1].toLowerCase(),
      detail: fields.slice(2).join("|"),
      raw,
    };
  }
  if (type === "RESET" && fields[0]) {
    return {
      type: "reset",
      reason: fields.join("|").toLowerCase(),
      raw,
    };
  }
  return null;
}

function base64ToBinaryString(base64) {
  if (typeof atob === "function") return atob(String(base64 || ""));
  return Buffer.from(String(base64 || ""), "base64").toString("binary");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function abortError() {
  return new DOMException("The operation was stopped.", "AbortError");
}

function abortableDelay(durationMs, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, durationMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(abortError());
      },
      { once: true },
    );
  });
}

function runAbortableHardwareOperation(operation, signal, onAbort) {
  if (!signal) return operation;
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      Promise.resolve()
        .then(onAbort)
        .finally(() => reject(abortError()));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", handleAbort);
    });
  });
}

const ESP_SERIAL_FILTERS = Object.freeze([
  Object.freeze({ usbVendorId: 0x10c4 }),
  Object.freeze({ usbVendorId: 0x1a86 }),
  Object.freeze({ usbVendorId: 0x0403 }),
  Object.freeze({ usbVendorId: 0x303a }),
]);

function normalizeFirmwareSpec(spec = {}) {
  return {
    board: cleanText(spec?.board, ""),
    behavior: cleanText(spec?.behavior, ""),
    libraries: textArray(spec?.libraries),
    pinAssignments: array(spec?.pinAssignments).map((pin) => ({
      label: cleanText(pin?.label, ""),
      gpio: Number.isInteger(pin?.gpio) ? pin.gpio : -1,
      mode: cleanText(pin?.mode, ""),
      purpose: cleanText(pin?.purpose, ""),
    })),
    serialProtocol: textArray(spec?.serialProtocol),
  };
}

function normalizeFirmware(firmware = {}) {
  return {
    language: cleanText(firmware?.language, "Arduino C++"),
    sketch: cleanText(firmware?.sketch, ""),
    notes: cleanText(firmware?.notes, ""),
  };
}

function normalizeFeasibilityStatus(status) {
  return /missing/i.test(String(status || "")) ? "missing" : "ready";
}

function normalizeConfidence(value) {
  let result = Number(value);
  if (!Number.isFinite(result)) result = 0;
  if (result > 1) result /= 100;
  return round(clamp(result, 0, 1), 3);
}

function uniqueId(value, usedIds) {
  const base = slug(value) || "part";
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function cleanText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function textArray(value) {
  return array(value).map((item) => cleanText(item, "")).filter(Boolean);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, precision = 2) {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function positiveNumber(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : fallback;
}

function createBrowserCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
