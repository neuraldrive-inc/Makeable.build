import assert from "node:assert/strict";
import test from "node:test";

import * as actions from "../../src/makeable/actions.js";

test("AI plans normalize bounds, confidence, feasibility, missing parts, alternatives, and diagnostics", () => {
  assert.equal(
    typeof actions.normalizeHardwarePlan,
    "function",
    "normalizeHardwarePlan should be exported",
  );

  const plan = actions.normalizeHardwarePlan({
    projectTitle: "Desk fan",
    summary: "A small fan for a desk",
    parts: [
      {
        id: " board ",
        name: "Arduino Uno",
        type: "controller",
        role: "Controller",
        confidence: 96,
        bbox: { x: 120, y: 150, width: 420, height: 500 },
      },
      {
        id: "motor",
        name: "Possible DC motor",
        type: "motor",
        role: "Output",
        confidence: 0.54,
        bounds: { x: -10, y: 85, width: 30, height: 30 },
      },
    ],
    feasibility: {
      status: "missing_parts",
      reasons: ["A fan blade is still needed."],
    },
    missingParts: [
      {
        id: "fan-blade",
        name: "Fan blade",
        reason: "Moves the air",
        searchTerms: ["3V motor fan blade", "2mm shaft"],
        compatibleWith: ["motor"],
      },
    ],
    alternatives: [
      {
        id: "motor-spinner",
        title: "Paper spinner",
        summary: "Use the motor without a fan blade.",
        requiredPartIds: ["motor"],
      },
    ],
    diagnostics: {
      requestId: "resp_123",
      warnings: ["Check the motor voltage."],
    },
  });

  assert.deepEqual(plan.parts[0].bounds, {
    x: 12,
    y: 15,
    width: 42,
    height: 50,
  });
  assert.equal(plan.parts[0].confidence, 0.96);
  assert.equal(plan.parts[0].lowConfidence, false);
  assert.equal(plan.parts[0].confirmed, true);
  assert.deepEqual(plan.parts[1].bounds, {
    x: 0,
    y: 85,
    width: 30,
    height: 15,
  });
  assert.equal(plan.parts[1].lowConfidence, true);
  assert.equal(plan.parts[1].confirmed, false);
  assert.equal(plan.feasibility.status, "missing");
  assert.equal(plan.missingParts[0].obtained, false);
  assert.deepEqual(plan.alternatives[0].requiredPartIds, ["motor"]);
  assert.deepEqual(plan.diagnostics, {
    schemaVersion: 1,
    requestId: "resp_123",
    warnings: ["Check the motor voltage."],
    partCount: 2,
    lowConfidencePartIds: ["motor"],
  });
});

test("annotation edits are immutable, bounded, and require explicit low-confidence confirmation", () => {
  assert.equal(typeof actions.updateDetectedPart, "function");
  assert.equal(typeof actions.canConfirmParts, "function");

  const parts = [
    {
      id: "motor",
      name: "Possible motor",
      confidence: 0.52,
      lowConfidence: true,
      confirmed: false,
      bounds: { x: 20, y: 25, width: 30, height: 35 },
    },
  ];
  const renamed = actions.updateDetectedPart(parts, "motor", {
    name: "DC motor",
    bounds: { x: 92, y: -5, width: 20, height: 110 },
  });

  assert.notEqual(renamed, parts);
  assert.equal(parts[0].name, "Possible motor");
  assert.equal(renamed[0].name, "DC motor");
  assert.deepEqual(renamed[0].bounds, {
    x: 92,
    y: 0,
    width: 8,
    height: 100,
  });
  assert.equal(actions.canConfirmParts(renamed), false);
  assert.equal(
    actions.canConfirmParts(
      actions.updateDetectedPart(renamed, "motor", { confirmed: true }),
    ),
    true,
  );
});

test("file and camera inputs share the orientation-aware compression pipeline", async () => {
  assert.equal(typeof actions.normalizeImageFile, "function");
  const calls = [];
  const source = {
    width: 2400,
    height: 1200,
    close() {
      calls.push(["close"]);
    },
  };
  const resultBlob = new Blob(["normalized"], { type: "image/jpeg" });
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        fillStyle: "",
        fillRect(...args) {
          calls.push(["fillRect", ...args]);
        },
        drawImage(...args) {
          calls.push(["drawImage", ...args]);
        },
      };
    },
    async convertToBlob(options) {
      calls.push(["convertToBlob", options]);
      return resultBlob;
    },
  };
  const file = new Blob(["photo"], { type: "image/png" });

  const normalized = await actions.normalizeImageFile(file, {
    maxSide: 1200,
    quality: 0.8,
    createImageBitmap: async (received, options) => {
      calls.push(["createImageBitmap", received, options]);
      return source;
    },
    createCanvas: () => canvas,
  });

  assert.equal(normalized.blob, resultBlob);
  assert.equal(normalized.width, 1200);
  assert.equal(normalized.height, 600);
  assert.deepEqual(calls[0], [
    "createImageBitmap",
    file,
    { imageOrientation: "from-image" },
  ]);
  assert.deepEqual(calls.find(([name]) => name === "drawImage").slice(2), [
    0,
    0,
    1200,
    600,
  ]);
  assert.deepEqual(
    calls.find(([name]) => name === "convertToBlob"),
    ["convertToBlob", { type: "image/jpeg", quality: 0.8 }],
  );
});

test("part searches are targeted and alternatives only use the confirmed inventory", () => {
  assert.equal(typeof actions.createPartSearchUrl, "function");
  assert.equal(typeof actions.inventoryCompatibleAlternatives, "function");
  const inventory = [
    { id: "board", name: "Arduino Uno" },
    { id: "motor", name: "DC motor" },
  ];
  const url = new URL(
    actions.createPartSearchUrl(
      {
        name: "Fan blade",
        searchTerms: ["2mm shaft", "3V motor"],
        compatibleWith: ["motor"],
      },
      inventory,
    ),
  );

  assert.equal(url.origin, "https://www.google.com");
  assert.match(url.searchParams.get("q"), /Fan blade/);
  assert.match(url.searchParams.get("q"), /2mm shaft/);
  assert.match(url.searchParams.get("q"), /DC motor/);
  assert.deepEqual(
    actions
      .inventoryCompatibleAlternatives(
        [
          { id: "spinner", requiredPartIds: ["board", "motor"] },
          { id: "plant", requiredPartIds: ["board", "soil-sensor"] },
        ],
        inventory,
      )
      .map(({ id }) => id),
    ["spinner"],
  );
});
