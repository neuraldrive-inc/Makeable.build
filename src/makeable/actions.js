export const PLAN_SCHEMA_VERSION = 1;
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_IMAGE_MAX_SIDE = 1800;
export const DEFAULT_IMAGE_QUALITY = 0.86;
export const PROJECT_ARTIFACT_PATHS = Object.freeze([
  "README.md",
  "build-guide/README.md",
  "parts-list/README.md",
  "test-results/README.md",
]);
export const HOSTED_FIRMWARE_LIBRARIES = Object.freeze([
  "ESP32 Arduino core built-ins (Arduino, Wire, SPI, WiFi, HTTPClient, Preferences, FS)",
  "Adafruit Unified Sensor",
  "DHT sensor library",
  "Adafruit NeoPixel",
  "ESP32Servo",
  "Adafruit GFX Library",
  "Adafruit SSD1306",
  "ArduinoJson",
  "PubSubClient",
]);

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
    required: { type: "boolean" },
  },
  required: [
    "id",
    "name",
    "reason",
    "searchTerms",
    "compatibleWith",
    "required",
  ],
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
    explanation: { type: "string" },
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
    "explanation",
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
      enum: ["board", "sensor", "display", "actuator", "power"],
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
  const declaredStatus = normalizeFeasibilityStatus(raw.feasibility?.status);
  const missingParts = array(raw.missingParts).map((part, index) => ({
    id: slug(part?.id || part?.name || `missing-${index + 1}`),
    name: cleanText(part?.name, `Missing part ${index + 1}`),
    reason: cleanText(part?.reason, ""),
    searchTerms: textArray(part?.searchTerms),
    compatibleWith: textArray(part?.compatibleWith).map(slug),
    required: isRequiredMissingPart(part),
    obtained: Boolean(part?.obtained),
  }));
  const hasOutstandingRequiredPart = requiredMissingParts(missingParts).some(
    ({ obtained }) => !obtained,
  );
  const status =
    hasOutstandingRequiredPart ||
    (declaredStatus === "missing" && missingParts.length === 0)
      ? "missing"
      : "ready";
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
    missingParts,
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

export function validateRepositoryName(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return {
      valid: false,
      value: "",
      message: "Enter a repository name.",
    };
  }
  if (
    normalized.length > 100 ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/.test(normalized) ||
    normalized.includes("..")
  ) {
    return {
      valid: false,
      value: normalized,
      message: "Use 1–100 letters, numbers, dots, dashes, or underscores.",
    };
  }
  return { valid: true, value: normalized, message: "" };
}

export function createProjectArtifacts(project = {}) {
  const title = cleanText(
    project.feasibility?.projectTitle,
    cleanText(ideaText(project.idea), "Makeable Project"),
  );
  const summary = cleanText(
    project.feasibility?.summary,
    "A beginner-friendly hardware project made with Makeable.",
  );
  const parts = array(project.confirmedParts);
  const steps = array(project.wiring?.steps);
  const automaticChecks = array(project.tests?.automatic?.checks);
  const manual = project.tests?.manual || {};
  const board = cleanText(
    project.firmware?.flash?.boardName ||
      project.feasibility?.firmwareSpec?.board,
    "Configured board",
  );
  const notes = cleanText(project.firmware?.notes, "");

  const readme = `# ${title}

${summary}

## What it does

${cleanText(project.feasibility?.firmwareSpec?.behavior, summary)}

## Project package

- [Build guide](build-guide/README.md)
- [Parts list](parts-list/README.md)
- [Test results](test-results/README.md)

## Board

${board}

The board software stays inside Makeable and is loaded directly onto the connected ESP32.

${notes ? `## Firmware note\n\n${notes}\n\n` : ""}---

Built with Makeable.
`;
  const buildGuide = `# ${title} — Build Guide

${summary}

${steps.length
    ? steps
        .map(
          (step, index) => `## Step ${Number(step.order) || index + 1}: ${cleanText(
            step.title,
            "Make the connection",
          )}

${cleanText(step.instruction, "")}

**Quick check:** ${cleanText(step.check, "Confirm the connection is secure.")}
`,
        )
        .join("\n")
    : "No assembly steps were generated."}

## Safety

Disconnect power before changing wiring and keep electronics dry.
`;
  const partsList = `# ${title} — Parts List

| Part | Role | Confirmed |
| --- | --- | --- |
${parts.length
    ? parts
        .map(
          (part) =>
            `| ${markdownCell(part.name)} | ${markdownCell(part.role || part.type)} | ${
              part.confirmed === false ? "Needs review" : "Yes"
            } |`,
        )
        .join("\n")
    : "| No confirmed parts | — | — |"}
`;
  const testResults = `# ${title} — Test Results

## Automatic hardware checks

| Check | Result | Detail |
| --- | --- | --- |
${automaticChecks.length
    ? automaticChecks
        .map(
          (check) =>
            `| ${markdownCell(check.name || check.id)} | ${resultLabel(
              check.status,
            )} | ${markdownCell(check.detail)} |`,
        )
        .join("\n")
    : "| No automatic results | Not run | — |"}

## Real-world check

- Action: ${cleanText(
    manual.requestedAction,
    cleanText(manual.action, "Not recorded"),
  )}
- Result: ${manual.acknowledged ? "Acknowledged" : "Not confirmed"}
- Evaluation: ${resultLabel(manual.evaluation?.status)}
${array(manual.evaluation?.observations)
    .map((observation) => `- Observation: ${cleanText(observation, "")}`)
    .join("\n")}
`;

  const contents = [readme, buildGuide, partsList, testResults];
  return PROJECT_ARTIFACT_PATHS.map((path, index) =>
    Object.freeze({
      path,
      content: contents[index],
      mimeType: "text/markdown;charset=utf-8",
    }),
  );
}

export async function publishProjectArtifacts({
  project,
  repositoryName,
  isPrivate = false,
  configuredOwner = "",
  fetchImpl = globalThis.fetch,
} = {}) {
  const validation = validateRepositoryName(repositoryName);
  if (!validation.valid) throw new Error(validation.message);
  const artifacts = createProjectArtifacts(project);
  const configured = String(configuredOwner || "").trim();
  if (!configured) {
    throw new Error(
      "Set GITHUB_OWNER on the Makeable server before publishing.",
    );
  }
  let repository;

  const createResponse = await fetchImpl("/api/github/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: validation.value,
      description: `${cleanText(
        project?.feasibility?.projectTitle,
        "Hardware project",
      )} — built with Makeable`,
      private: Boolean(isPrivate),
    }),
  });
  const created = await safeResponseJson(createResponse);
  if (createResponse.ok) {
    const owner = cleanText(created?.owner?.login, configured);
    const name = cleanText(created?.name, validation.value);
    const publishCapability = cleanText(created?.publishCapability, "");
    if (
      owner.toLowerCase() !== configured.toLowerCase() ||
      name !== validation.value ||
      !publishCapability
    ) {
      throw new Error("GitHub returned repository details that could not be verified.");
    }
    repository = {
      owner,
      name,
      html_url: cleanText(created?.html_url, `https://github.com/${owner}/${name}`),
      private: Boolean(created?.private),
      publishCapability,
    };
  } else if (createResponse.status === 422) {
    throw new Error("That repository name is already in use. Choose a new name and try again.");
  } else {
    throw new Error(
      cleanText(
        created.error || created.message,
        `GitHub could not create the repository (HTTP ${createResponse.status}).`,
      ),
    );
  }

  for (const artifact of artifacts) {
    const uploadResponse = await fetchImpl("/api/github/upload-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: repository.owner,
        repo: repository.name,
        path: artifact.path,
        content: artifact.content,
        message: `Update ${artifact.path} from Makeable`,
        publishCapability: repository.publishCapability,
      }),
    });
    if (!uploadResponse.ok) {
      const failure = await safeResponseJson(uploadResponse);
      throw new Error(
        cleanText(
          failure.error || failure.message,
          `GitHub could not upload ${artifact.path} (HTTP ${uploadResponse.status}).`,
        ),
      );
    }
  }

  return {
    owner: repository.owner,
    repositoryName: repository.name,
    repositoryUrl: repository.html_url,
    visibility: repository.private ? "private" : "public",
    uploadedPaths: artifacts.map(({ path }) => path),
  };
}

export async function sharePublishedProject({
  repositoryUrl,
  title = "Makeable project",
  navigatorLike = globalThis.navigator,
} = {}) {
  if (!repositoryUrl) throw new Error("A repository URL is required.");
  if (typeof navigatorLike?.share === "function") {
    try {
      await navigatorLike.share({
        title,
        text: `${title} — built with Makeable`,
        url: repositoryUrl,
      });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // A denied or unavailable share sheet falls through to clipboard.
    }
  }
  if (typeof navigatorLike?.clipboard?.writeText === "function") {
    await navigatorLike.clipboard.writeText(repositoryUrl);
    return "copied";
  }
  throw new Error("Sharing and clipboard access are unavailable.");
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
  const ready = requiredMissingParts(updatedMissing).every(
    ({ obtained }) => obtained,
  );

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

export function isRequiredMissingPart(part) {
  const description = `${part?.name || ""} ${part?.reason || ""}`;
  if (
    /\b(?:usb(?:-c| micro-usb)?\s+(?:data|programming|upload)\s+cable|programming cable|computer|laptop)\b/i.test(
      description,
    )
  ) {
    return false;
  }
  if (part?.required === false) return false;
  if (part?.required === true) return true;
  return !/^\s*optional\b/i.test(String(part?.name || ""));
}

export function requiredMissingParts(parts) {
  return array(parts).filter(isRequiredMissingPart);
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
  return array(alternatives)
    .filter(({ requiredPartIds }) =>
      textArray(requiredPartIds).every((id) => inventory.has(slug(id))),
    )
    .sort(
      (left, right) =>
        textArray(right.requiredPartIds).length -
        textArray(left.requiredPartIds).length,
    );
}

export async function requestHardwarePlan({
  idea,
  imageDataUrl,
  confirmedParts,
  fetchImpl = globalThis.fetch,
  model = globalThis.MAKEABLE_CONFIG?.openaiModel || "gpt-5.6-terra",
  signal,
}) {
  const confirmation = Array.isArray(confirmedParts);
  const projectIntent = planningIdeaText(idea);
  const userContent = confirmation
    ? [
        {
          type: "input_text",
          text: [
            `Project idea: ${projectIntent}`,
            "Regenerate the beginner-safe guide and firmware from this confirmed inventory.",
            "Treat this as the confirmed inventory; do not re-identify or add photographed parts.",
            JSON.stringify(confirmedParts),
            "Inventory-first reasoning rules:",
            "- Maximize the meaningful safe use of all safely compatible confirmed parts. Prefer a cohesive input → controller logic → output behavior over a minimal controller-only or bare-GPIO demonstration.",
            "- Confirmed part names and physical types are authoritative. Their role labels may be stale from an earlier project or fallback, so reassign roles from the actual hardware capabilities.",
            "- Treat sensors as inputs and displays as outputs. If a confirmed controller, sensor, and display can form a complete useful build, mark it ready and use all three.",
            "- Do not require an actuator, motor, relay, or switch merely to make an observable result when a confirmed display can show that result.",
            "- Classify an OLED, LCD, screen, or e-paper check as a display diagnostic, never an actuator. Reserve actuator for outputs that create physical motion, heat, fluid flow, or power switching.",
            "- Treat a computer and USB data cable used only to program or monitor the controller as setup equipment, not missing project parts. Mention setup equipment in notes or warnings, never missingParts.",
            "- The summary must clearly explain each confirmed part’s role and how information or control flows between them.",
            "- If the exact idea is impossible, rank alternatives by how many safely compatible confirmed functional parts they use, with the fullest useful build first.",
            "Return honest feasibility, missing parts, compatible alternatives, wiring, firmware, and stable diagnostics.",
            "Set missingParts.required true only for parts essential to complete, load, or safely test this build. Mark nice-to-have accessories false, and never let optional parts make feasibility missing.",
            hostedFirmwareRequirements(),
            firmwareDiagnosticRequirements(),
            "Never invent prices, sellers, stock, or checkout.",
          ].join("\n\n"),
        },
      ]
    : [
        {
          type: "input_text",
          text: [
            `Project idea: ${projectIntent}`,
            "Identify only actual visible parts needed for the idea.",
            "Use tight 0-100 percentage bounds and conservative confidence.",
            "Propose alternatives that maximize meaningful safe use of the detected compatible parts. Prefer sensor → controller → display behavior over controller-only GPIO demonstrations, and do not invent an actuator or switch when a display already provides useful output.",
            "Classify OLED, LCD, screen, and e-paper checks as display diagnostics, never actuators.",
            "Treat a computer and USB data cable used only for programming or monitoring as setup equipment, not missing project parts.",
            "Write the summary as a clear role-by-role explanation of how the visible parts work together.",
            "Return honest feasibility, missing parts, inventory-compatible alternatives, and stable diagnostics.",
            "Set missingParts.required true only for parts essential to complete, load, or safely test this build. Mark nice-to-have accessories false, and never let optional parts make feasibility missing.",
            hostedFirmwareRequirements(),
            firmwareDiagnosticRequirements(),
            "Do not invent prices, sellers, stock, or checkout.",
          ].join("\n\n"),
        },
        { type: "input_image", image_url: imageDataUrl, detail: "high" },
      ];
  const payload = {
    model,
    reasoning: {
      effort: globalThis.MAKEABLE_CONFIG?.openaiReasoningEffort || "high",
    },
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
    signal,
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
  if (confirmation && plan.feasibility.status === "ready") {
    if (
      !hasFirmwareDiagnosticContract(
        plan.firmware?.sketch,
        plan.diagnostics?.tests,
      )
    ) {
      return repairHardwarePlanFirmware({
        plan,
        projectIntent,
        fetchImpl,
        model,
        signal,
      });
    }
  }
  return plan;
}

async function repairHardwarePlanFirmware({
  plan,
  projectIntent,
  fetchImpl,
  model,
  signal,
}) {
  const payload = {
    model,
    reasoning: {
      effort: globalThis.MAKEABLE_CONFIG?.openaiReasoningEffort || "high",
    },
    input: [
      {
        role: "system",
        content:
          "You repair Arduino firmware rejected by Makeable’s deterministic diagnostic validator. Preserve the supplied hardware behavior, wiring, pins, libraries, and diagnostic IDs. Return only schema-valid firmware JSON.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Project intent: ${projectIntent}`,
              "The hardware plan is already approved. Replace only the rejected firmware.",
              JSON.stringify({
                projectTitle: plan.projectTitle,
                summary: plan.summary,
                wiringSteps: plan.wiringSteps,
                firmwareSpec: plan.firmwareSpec,
                diagnostics: plan.diagnostics,
                rejectedFirmware: plan.firmware,
              }),
              hostedFirmwareRequirements(),
              firmwareDiagnosticRequirements(),
            ].join("\n\n"),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "makeable_firmware_repair",
        strict: true,
        schema: FIRMWARE_SCHEMA,
      },
    },
  };
  const response = await fetchImpl("/api/openai/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      cleanText(
        data?.error?.message || data?.error || data?.message,
        "The firmware could not be repaired.",
      ),
    );
  }
  const firmware = normalizeFirmware(parseResponsePayload(data));
  assertFirmwareDiagnosticContract(
    firmware.sketch,
    plan.diagnostics?.tests,
  );
  return {
    ...plan,
    firmware,
  };
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

export function planningIdeaText(idea) {
  const primary = ideaText(idea);
  if (typeof idea === "string" || !idea?.selectedAlternative) return primary;
  const selected = idea.selectedAlternative;
  const history = array(idea.history);
  const previous = cleanText(history.at(-1)?.text, "");
  return [
    previous ? `Original request context: ${previous}` : "",
    `Earlier fallback suggestion: ${cleanText(selected.title, primary)}`,
    cleanText(selected.summary, ""),
    "The earlier fallback is not a constraint: replace its title, roles, and implementation when another safe build uses more confirmed functional parts.",
    "Choose the fullest useful implementation supported by the confirmed compatible inventory.",
  ]
    .filter(Boolean)
    .join(". ");
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

export function createSafeDiagnosticStopCommand(diagnostic = {}) {
  const id = String(diagnostic.id || "");
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) {
    throw new TypeError("A safe diagnostic id is required.");
  }
  return `MAKEABLE|STOP|${id}\n`;
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
  scheduleDeadline = globalThis.setTimeout,
  clearDeadline = globalThis.clearTimeout,
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
        let offDeadline;
        let offPromise;
        let actuatorStopped = false;
        const stopActuator = async () => {
          if (actuatorStopped || check.kind !== "actuator") return;
          actuatorStopped = true;
          await session.write(createSafeDiagnosticStopCommand(check));
        };
        if (check.kind === "actuator") {
          offDeadline = scheduleDeadline(() => {
            offPromise = stopActuator();
          }, check.pulseMs);
        }
        let marker;
        try {
          marker = await session.waitForMarker(
            (candidate) =>
              check.kind === "board"
                ? candidate?.type === "ready"
                : candidate?.type === "check" && candidate.id === check.id,
            { timeoutMs: 6000, signal },
          );
        } finally {
          if (offDeadline !== undefined) clearDeadline(offDeadline);
          await (offPromise || stopActuator());
        }
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
  diagnostics,
  fqbn = "esp32:esp32:esp32",
  erase = false,
  serial = globalThis.navigator?.serial,
  fetchImpl = globalThis.fetch,
  loadEsptool = () =>
    import("../../assets/vendor/esptool-js/bundle.js"),
  onProgress = () => {},
  signal,
} = {}) {
  if (!String(sketch || "").trim()) {
    throw new Error("There isn’t code to load yet.");
  }
  assertFirmwareDiagnosticContract(sketch, diagnostics);
  const statusResponse = await fetchImpl("/api/esp32/status", { signal });
  const status = await safeJson(statusResponse);
  if (!statusResponse.ok) {
    throw new Error(
      status.message ||
        status.error ||
        "The hosted ESP32 compiler could not be reached.",
    );
  }
  if (
    !(status.firmwareCompileSupported || status.hasEsp32Compiler || status.hasArduinoCli) ||
    !status.hasEsp32Core
  ) {
    throw new Error(
      status.message || "The hosted ESP32 compiler is temporarily unavailable.",
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
  let activeSketch = String(sketch);
  let compiled;
  try {
    compiled = await compileHostedFirmware({ activeSketch, fqbn, fetchImpl, signal });
  } catch (error) {
    if (error.status !== 500 || !error.compilerDetails) throw error;
    onProgress({ phase: "repair", percent: 8, label: "Repairing a compiler issue" });
    activeSketch = await repairCompilerFailure({
      sketch: activeSketch,
      fqbn,
      diagnostics,
      compilerDetails: error.compilerDetails,
      fetchImpl,
      signal,
    });
    assertFirmwareDiagnosticContract(activeSketch, diagnostics);
    onProgress({ phase: "compile", percent: 12, label: "Verifying the repaired code" });
    compiled = await compileHostedFirmware({ activeSketch, fqbn, fetchImpl, signal });
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
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
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
    sketch: activeSketch,
  };
}

async function compileHostedFirmware({ activeSketch, fqbn, fetchImpl, signal }) {
  const response = await fetchImpl("/api/firmware/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sketch: activeSketch, fqbn }),
    signal,
  });
  const compiled = await safeJson(response);
  if (!response.ok || !array(compiled.images).length) {
    const error = new Error(
      compiled.hint || compiled.error || "The code did not compile into a flashable ESP32 image.",
    );
    error.status = response.status;
    error.compilerDetails = cleanText(compiled.details || compiled.stderr, "");
    throw error;
  }
  return compiled;
}

async function repairCompilerFailure({
  sketch,
  fqbn,
  diagnostics,
  compilerDetails,
  fetchImpl,
  signal,
}) {
  const payload = {
    model: globalThis.MAKEABLE_CONFIG?.openaiReasoningModel || "gpt-5.6-terra",
    reasoning: {
      effort: globalThis.MAKEABLE_CONFIG?.openaiReasoningEffort || "low",
    },
    input: [
      {
        role: "system",
        content:
          "You repair ESP32 Arduino-core C++ after a real compiler failure. Return the complete corrected sketch as schema-valid JSON. Preserve behavior, pins, and Makeable diagnostic markers.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Target board: ${fqbn}`,
              hostedFirmwareRequirements(),
              firmwareDiagnosticRequirements(),
              `Required diagnostic IDs: ${array(diagnostics).map(({ id }) => id).join(", ") || "none"}`,
              `Compiler diagnostic:\n${compilerDetails}`,
              `Original sketch:\n${sketch}`,
            ].join("\n\n"),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "esp32_firmware_repair",
        strict: true,
        schema: FIRMWARE_SCHEMA,
      },
    },
  };
  const response = await fetchImpl("/api/openai/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      cleanText(data?.error?.message || data?.error, "The automatic code repair could not finish."),
    );
  }
  return normalizeFirmware(parseResponsePayload(data)).sketch;
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

export function hasFirmwareDiagnosticContract(sketch, diagnostics) {
  const source = stripCppComments(sketch);
  const emits = (marker) =>
    new RegExp(
      `Serial\\s*\\.\\s*(?:print|println|printf)\\s*\\(\\s*["']MAKEABLE\\|${marker}\\|`,
      "i",
    ).test(source);
  const hasExecutableRun = Boolean(
    findCommandBlock(extractBalancedIfBlocks(source), "RUN", source),
  );
  const normalizedDiagnostics = Array.isArray(diagnostics)
    ? normalizeDiagnosticTests(diagnostics)
    : [];
  const requiresActuatorSafety =
    normalizedDiagnostics.length === 0 ||
    normalizedDiagnostics.some(({ kind }) => kind === "actuator") ||
    containsEnergizingWrite(source);
  return (
    emits("READY") &&
    emits("CHECK") &&
    emits("RESET") &&
    hasExecutableRun &&
    (!requiresActuatorSafety || hasBranchBoundActuatorSafety(source))
  );
}

export function assertFirmwareDiagnosticContract(sketch, diagnostics) {
  if (hasFirmwareDiagnosticContract(sketch, diagnostics)) return true;
  throw new Error(
    "Firmware must emit MAKEABLE READY, CHECK, and RESET markers, handle executable RUN and STOP commands, and enforce a millis-based actuator-off safety deadline.",
  );
}

export async function evaluateManualTest({
  projectTitle,
  requestedAction,
  imageDataUrl,
  serialOutput,
  fetchImpl = globalThis.fetch,
  model = globalThis.MAKEABLE_CONFIG?.openaiReasoningModel || "gpt-5.6-terra",
  signal,
} = {}) {
  if (!imageDataUrl) throw new Error("Capture one camera frame first.");
  const payload = {
    model,
    reasoning: {
      effort: globalThis.MAKEABLE_CONFIG?.openaiReasoningEffort || "high",
    },
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
    signal,
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
    const description = `${diagnostic?.id || ""} ${diagnostic?.name || ""}`;
    const displayLike =
      /\b(?:oled|lcd|display|screen|e-?paper)\b/i.test(description);
    const requestedKind =
      diagnostic?.kind === "actuator" &&
      displayLike &&
      Number(diagnostic?.pulseMs) <= 0
        ? "display"
        : diagnostic?.kind;
    const kind = [
      "board",
      "sensor",
      "display",
      "actuator",
      "power",
    ].includes(requestedKind)
      ? requestedKind
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

function hostedFirmwareRequirements() {
  return [
    "Makeable supports only ESP32-family targets: ESP32, ESP32-S2, ESP32-S3, ESP32-C3, or ESP32-C6.",
    `Use only libraries installed in the hosted compiler: ${HOSTED_FIRMWARE_LIBRARIES.join(", ")}.`,
    "Do not invent headers, packages, classes, methods, pin aliases, or APIs outside those libraries.",
  ].join(" ");
}

function firmwareDiagnosticRequirements() {
  return [
    "The firmware sketch must implement Makeable’s complete serial diagnostic contract.",
    'Emit `MAKEABLE|RESET|<reason>` from setup using the ESP32 reset reason, then emit `MAKEABLE|READY|<detected board>`.',
    'Emit `MAKEABLE|CHECK|<id>|PASS|<detail>` or `MAKEABLE|CHECK|<id>|FAIL|<detail>` for every diagnostic.',
    'Read newline-delimited serial input, handle only `MAKEABLE|RUN|<id>|<pulseMs>` and `MAKEABLE|STOP|<id>`, reject unknown IDs, and clamp actuator pulses to at most 1000 ms.',
    "Before energizing an actuator, set an internal monotonic millis() off deadline; the main loop must de-energize it when that deadline arrives even if no more serial input is received, and STOP must de-energize it immediately.",
    "Use this exact canonical safety shape with braced blocks, top-level statements, and direct physical pin writes or explicit PWM writes: in RUN assign `deadline = millis() + pulseMs` before HIGH or nonzero PWM; in STOP perform the matching LOW or zero PWM before any return; outside RUN and STOP use an unconditional canonical rollover-safe `if ((long)(millis() - deadline) >= 0) { digitalWrite(pin, LOW); }` block. Do not add extra && or || guards or nested control blocks; do not delegate energizing or de-energizing to helper calls.",
    "Do not place these markers only in comments; print them through Serial and parse the RUN prefix in executable code.",
  ].join(" ");
}

function stripCppComments(source) {
  return String(source || "").replace(
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (_match, literal) => literal || "",
  );
}

function containsEnergizingWrite(source) {
  const executable = String(source || "").replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    "",
  );
  if (/\bdigitalWrite\s*\(\s*[^,()]+\s*,\s*HIGH\s*\)/.test(executable)) {
    return true;
  }
  for (const match of executable.matchAll(
    /\b(?:analogWrite|ledcWrite)\s*\(\s*[^,()]+\s*,\s*([^,)]+)\)/g,
  )) {
    if (!/^0(?:[uUlL]*)?$/.test(match[1].trim())) return true;
  }
  return false;
}

function hasBranchBoundActuatorSafety(source) {
  const ifBlocks = extractBalancedIfBlocks(source);
  const runBlock = findCommandBlock(ifBlocks, "RUN", source);
  const stopBlock = findCommandBlock(ifBlocks, "STOP", source);
  if (!runBlock || !stopBlock) return false;

  const runPrefix = canonicalTopLevelPrefix(runBlock.body);
  const stopPrefix = canonicalTopLevelPrefix(stopBlock.body);
  if (runPrefix === null || stopPrefix === null) return false;
  const energizedWrites = directActuatorWrites(runPrefix, "on");
  const energizedTargets = new Set(energizedWrites.map(({ target }) => target));
  if (!energizedTargets.size) return false;
  if (
    !setContainsAll(
      directActuatorTargets(stopPrefix, "off"),
      energizedTargets,
    )
  ) {
    return false;
  }

  const deadlineAssignments = findMillisDeadlineAssignments(source);
  const runDeadlineAssignments = directMillisDeadlineAssignments(runPrefix);
  const firstEnergizeIndex = Math.min(
    ...energizedWrites.map(({ index }) => index),
  );
  if (
    !deadlineAssignments.length ||
    !runDeadlineAssignments.length ||
    runDeadlineAssignments.some(({ index }) => index >= firstEnergizeIndex) ||
    deadlineAssignments.some(
      ({ index }) =>
        index < runBlock.bodyStart ||
        index >= runBlock.bodyStart + runPrefix.length,
    )
  ) {
    return false;
  }

  const deadlineNames = new Set(deadlineAssignments.map(({ name }) => name));
  for (const deadline of deadlineNames) {
    if (hasDeadlineResetOutsideRun(source, deadline, runBlock)) return false;
    const safetyBlock = ifBlocks.find((block) => {
      if (
        rangeContains(runBlock, block.start) ||
        rangeContains(stopBlock, block.start) ||
        !conditionEnforcesDeadline(block.condition, deadline)
      ) {
        return false;
      }
      const safetyPrefix = canonicalTopLevelPrefix(block.body);
      return (
        safetyPrefix !== null &&
        setContainsAll(
          directActuatorTargets(safetyPrefix, "off"),
          energizedTargets,
        )
      );
    });
    if (!safetyBlock) return false;
  }
  return true;
}

function extractBalancedIfBlocks(source) {
  const blocks = [];
  const pattern = /\bif\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const conditionOpen = source.indexOf("(", match.index);
    const conditionClose = matchingDelimiter(source, conditionOpen, "(", ")");
    if (conditionClose < 0) continue;
    const bodyOpen = skipWhitespace(source, conditionClose + 1);
    if (source[bodyOpen] !== "{") continue;
    const bodyClose = matchingDelimiter(source, bodyOpen, "{", "}");
    if (bodyClose < 0) continue;
    blocks.push({
      start: match.index,
      end: bodyClose + 1,
      bodyStart: bodyOpen + 1,
      condition: source.slice(conditionOpen + 1, conditionClose),
      body: source.slice(bodyOpen + 1, bodyClose),
    });
  }
  return blocks;
}

function findCommandBlock(blocks, command, source = "") {
  const pattern = new RegExp(
    `(?:startsWith|indexOf)\\s*\\(\\s*["']MAKEABLE\\|${command}\\||` +
      `strncmp\\s*\\([^,\\n]+,\\s*["']MAKEABLE\\|${command}\\|`,
    "i",
  );
  const directBlock =
    blocks.find(({ condition }) => pattern.test(condition)) || null;
  if (directBlock) return directBlock;

  const aliases = immutableCommandPrefixAliases(source, command);
  if (!aliases.size) return null;
  return (
    blocks.find(({ condition }) =>
      [...aliases].some((alias) => {
        const escapedAlias = escapeRegExp(alias);
        return new RegExp(
          `(?:startsWith|indexOf)\\s*\\(\\s*${escapedAlias}\\b|` +
            `strncmp\\s*\\([^,\\n]+,\\s*${escapedAlias}\\b`,
          "i",
        ).test(condition);
      }),
    ) || null
  );
}

function immutableCommandPrefixAliases(source, command) {
  const aliases = new Set();
  const prefix = `MAKEABLE\\|${command}\\|`;
  const declaration = new RegExp(
    `\\b(?:static\\s+)?const\\s+(?:String|char\\s*\\*)\\s+` +
      `([A-Za-z_]\\w*)\\s*=\\s*["']${prefix}["']\\s*;|` +
      `\\b(?:static\\s+)?constexpr\\s+char\\s+` +
      `([A-Za-z_]\\w*)\\s*\\[\\s*\\]\\s*=\\s*["']${prefix}["']\\s*;`,
    "gi",
  );
  for (const match of String(source || "").matchAll(declaration)) {
    aliases.add(match[1] || match[2]);
  }
  return aliases;
}

function directActuatorTargets(block, state) {
  return new Set(
    directActuatorWrites(block, state).map(({ target }) => target),
  );
}

function directActuatorWrites(block, state) {
  const writes = [];
  const digitalLevel = state === "on" ? "HIGH" : "LOW";
  const digitalPattern = new RegExp(
    `^digitalWrite\\s*\\(\\s*([A-Za-z_]\\w*|\\d+)\\s*,\\s*${digitalLevel}\\s*\\)\\s*;$`,
  );
  const pwmPattern =
    /^(?:analogWrite|ledcWrite)\s*\(\s*([A-Za-z_]\w*|\d+)\s*,\s*(\d+)\s*\)\s*;$/;
  for (const statement of topLevelSemicolonStatements(block)) {
    const source = statement.source.trim();
    const index = statement.start + statement.source.indexOf(source);
    const digitalMatch = digitalPattern.exec(source);
    if (digitalMatch) {
      writes.push({ target: digitalMatch[1], index });
      continue;
    }
    const pwmMatch = pwmPattern.exec(source);
    if (pwmMatch) {
      const [, target, rawValue] = pwmMatch;
      const value = Number(rawValue);
      if ((state === "on" && value > 0) || (state === "off" && value === 0)) {
        writes.push({ target, index });
      }
    }
  }
  return writes;
}

function directMillisDeadlineAssignments(block) {
  const pattern =
    /^([A-Za-z_]\w*)\s*=\s*millis\s*\(\s*\)\s*\+\s*[^;]+;$/;
  return topLevelSemicolonStatements(block).flatMap((statement) => {
    const source = statement.source.trim();
    const match = pattern.exec(source);
    if (!match) return [];
    return [
      {
        name: match[1],
        index: statement.start + statement.source.indexOf(source),
      },
    ];
  });
}

function topLevelSemicolonStatements(source) {
  const statements = [];
  let start = 0;
  let parentheses = 0;
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") {
      parentheses += 1;
      continue;
    }
    if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
      continue;
    }
    if (character !== ";" || parentheses !== 0) continue;
    statements.push({
      start,
      source: source.slice(start, index + 1),
    });
    start = index + 1;
  }
  return statements;
}

function findMillisDeadlineAssignments(source) {
  return [
    ...source.matchAll(
      /\b([A-Za-z_]\w*)\s*=\s*millis\s*\(\s*\)\s*\+\s*[^;]+;/g,
    ),
  ].map((match) => ({ name: match[1], index: match.index }));
}

function hasDeadlineResetOutsideRun(source, deadline, runBlock) {
  const escaped = escapeRegExp(deadline);
  const assignments = source.matchAll(
    new RegExp(`\\b${escaped}\\s*=(?!=)`, "g"),
  );
  for (const assignment of assignments) {
    if (rangeContains(runBlock, assignment.index)) continue;
    if (isGlobalDeclarationInitializer(source, assignment.index, deadline)) continue;
    return true;
  }
  return false;
}

function isGlobalDeclarationInitializer(source, assignmentIndex, variable) {
  if (braceDepthAt(source, assignmentIndex) !== 0) return false;
  const statementStart =
    Math.max(
      source.lastIndexOf(";", assignmentIndex - 1),
      source.lastIndexOf("}", assignmentIndex - 1),
      source.lastIndexOf("{", assignmentIndex - 1),
      source.lastIndexOf("\n", assignmentIndex - 1),
    ) + 1;
  const declaration = source.slice(
    statementStart,
    assignmentIndex + variable.length,
  );
  return new RegExp(
    `^\\s*(?:(?:static|const|volatile)\\s+)*(?:unsigned\\s+long|long\\s+unsigned|unsigned|long|uint(?:8|16|32|64)_t|int|size_t|auto)\\s+${escapeRegExp(variable)}\\s*$`,
  ).test(declaration);
}

function conditionEnforcesDeadline(condition, deadline) {
  const compact = stripOuterParentheses(condition.trim()).replace(/\s+/g, "");
  const cast =
    "(?:\\((?:signed)?long\\)|\\(int32_t\\)|static_cast<(?:long|int32_t)>)";
  return new RegExp(
    `^${cast}\\(millis\\(\\)-${escapeRegExp(deadline)}\\)>=0$`,
  ).test(compact);
}

function stripOuterParentheses(value) {
  let result = value;
  while (
    result[0] === "(" &&
    matchingDelimiter(result, 0, "(", ")") === result.length - 1
  ) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function canonicalTopLevelPrefix(block) {
  let quote = "";
  for (let index = 0; index < block.length; index += 1) {
    const character = block[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#") return null;
    if (character === "{") return block.slice(0, index);
    if (!/[A-Za-z_]/.test(character)) continue;
    const tokenMatch = /^[A-Za-z_]\w*/.exec(block.slice(index));
    const token = tokenMatch?.[0] || "";
    if (
      /^(?:return|break|continue|goto|throw|if|for|while|switch|do|try|catch)$/.test(
        token,
      )
    ) {
      return block.slice(0, index);
    }
    index += Math.max(0, token.length - 1);
  }
  return block;
}

function matchingDelimiter(source, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  let quote = "";
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === openCharacter) depth += 1;
    if (character !== closeCharacter) continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function skipWhitespace(source, start) {
  let index = start;
  while (/\s/.test(source[index] || "")) index += 1;
  return index;
}

function braceDepthAt(source, end) {
  let depth = 0;
  let quote = "";
  for (let index = 0; index < end; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    }
  }
  return depth;
}

function rangeContains(range, index) {
  return index >= range.start && index < range.end;
}

function setContainsAll(container, required) {
  return [...required].every((value) => container.has(value));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function markdownCell(value) {
  return cleanText(value, "—")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function resultLabel(status) {
  if (status === "pass") return "Pass";
  if (status === "needs_attention") return "Needs attention";
  if (status === "fail") return "Needs attention";
  if (status === "uncertain") return "Uncertain";
  if (status === "stopped") return "Stopped";
  return "Not run";
}

async function safeResponseJson(response) {
  try {
    if (typeof response?.json === "function") return await response.json();
    if (typeof response?.text === "function") {
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    }
  } catch {
    return {};
  }
  return {};
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
