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
        requestId: { type: "string" },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["requestId", "warnings"],
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

export function normalizeHardwarePlan(raw = {}) {
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
  const requestId = cleanText(
    raw.diagnostics?.requestId || raw.responseId || raw.requestId,
    "",
  );

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
  return normalizeHardwarePlan(parseResponsePayload(data));
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
  };
}

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
