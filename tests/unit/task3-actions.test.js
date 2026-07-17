import assert from "node:assert/strict";
import test from "node:test";

import * as actions from "../../src/makeable/actions.js";

test("AI plans normalize bounds, confidence, feasibility, missing parts, alternatives, and diagnostics", () => {
  assert.equal(
    typeof actions.normalizeHardwarePlan,
    "function",
    "normalizeHardwarePlan should be exported",
  );

  const plan = actions.normalizeHardwarePlan(
    {
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
        requestId: "model_must_not_control_transport_identity",
        warnings: ["Check the motor voltage."],
      },
    },
    { requestId: "resp_123" },
  );

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
    tests: [],
    manualAction: "Perform the project’s real-world action and watch what happens.",
    manualQuestion: "Did the project respond as expected?",
    manualSuccessLabel: "Yes, it worked",
  });
});

test("hardware requests derive diagnostics identity only from the outer OpenAI response", async () => {
  let requestPayload;
  const modelPlan = {
    projectTitle: "Desk fan",
    summary: "A small fan",
    parts: [],
    feasibility: { status: "ready", reasons: [] },
    missingParts: [],
    alternatives: [],
    wiringSteps: [],
    firmwareSpec: {
      board: "",
      behavior: "",
      libraries: [],
      pinAssignments: [],
      serialProtocol: [],
    },
    firmware: {
      language: "Arduino C++",
      sketch: "",
      notes: "",
    },
    diagnostics: {
      requestId: "model_forged_id",
      warnings: [],
    },
  };

  const plan = await actions.requestHardwarePlan({
    idea: "Make a fan",
    imageDataUrl: "data:image/jpeg;base64,AA==",
    fetchImpl: async (_url, init) => {
      requestPayload = JSON.parse(init.body);
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            id: "resp_outer_456",
            output_text: JSON.stringify(modelPlan),
          });
        },
      };
    },
  });

  assert.equal(plan.diagnostics.requestId, "resp_outer_456");
  assert.deepEqual(
    requestPayload.text.format.schema.properties.diagnostics.required,
    [
      "warnings",
      "tests",
      "manualAction",
      "manualQuestion",
      "manualSuccessLabel",
    ],
  );
  assert.equal(
    "requestId" in requestPayload.text.format.schema.properties.diagnostics.properties,
    false,
  );
});

test("annotation frames align percentage coordinates to contained image content", () => {
  assert.equal(typeof actions.calculateContainedImageFrame, "function");
  assert.deepEqual(
    actions.calculateContainedImageFrame(
      { width: 1000, height: 1000 },
      { width: 2000, height: 500 },
    ),
    { left: 0, top: 375, width: 1000, height: 250 },
  );
  assert.deepEqual(
    actions.calculateContainedImageFrame(
      { width: 1000, height: 500 },
      { width: 500, height: 1000 },
    ),
    { left: 375, top: 0, width: 250, height: 500 },
  );
});

test("obtaining the final missing part adds it to inventory and makes feasibility ready", () => {
  assert.equal(typeof actions.acquireMissingPart, "function");
  const project = {
    confirmedParts: [{ id: "board", name: "Arduino Uno" }],
    feasibility: {
      status: "missing",
      reasons: ["A fan blade is still needed."],
      missingParts: [
        {
          id: "fan-blade",
          name: "Fan blade",
          reason: "Moves air",
          obtained: false,
        },
      ],
      alternatives: [{ id: "spinner" }],
    },
    wiring: { steps: [{ title: "Connect motor" }] },
    firmware: { sketch: "void setup() {}" },
  };

  const updated = actions.acquireMissingPart(project, "fan-blade");

  assert.equal(updated.feasibility.status, "ready");
  assert.deepEqual(updated.feasibility.reasons, []);
  assert.deepEqual(updated.feasibility.missingParts, []);
  assert.deepEqual(updated.confirmedParts.at(-1), {
    id: "fan-blade",
    name: "Fan blade",
    type: "acquired-part",
    role: "Required project part",
    confidence: 1,
    lowConfidence: false,
    confirmed: true,
    bounds: null,
  });
  assert.equal(updated.wiring, project.wiring);
  assert.equal(updated.firmware, project.firmware);
});

test("object URL registry revokes replaced and torn-down URLs", () => {
  assert.equal(typeof actions.createObjectUrlRegistry, "function");
  const revoked = [];
  let sequence = 0;
  const registry = actions.createObjectUrlRegistry({
    createObjectURL() {
      sequence += 1;
      return `blob:makeable-${sequence}`;
    },
    revokeObjectURL(url) {
      revoked.push(url);
    },
  });

  assert.equal(registry.replace("photo", "revision-1", new Blob()), "blob:makeable-1");
  assert.equal(registry.replace("photo", "revision-1", new Blob()), "blob:makeable-1");
  assert.deepEqual(revoked, []);
  assert.equal(registry.replace("photo", "revision-2", new Blob()), "blob:makeable-2");
  assert.deepEqual(revoked, ["blob:makeable-1"]);
  registry.revokeAll();
  assert.deepEqual(revoked, ["blob:makeable-1", "blob:makeable-2"]);
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
