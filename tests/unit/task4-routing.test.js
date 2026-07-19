import assert from "node:assert/strict";
import test from "node:test";

import { resolveRoute } from "../../src/makeable/router.js";

const throughCode = [
  "/build/new",
  "/build/parts/upload",
  "/build/parts/review",
  "/build/feasibility/ready",
  "/build/assemble",
  "/build/code",
];

test("automatic testing remains gated until a real flash succeeds", () => {
  const base = {
    feasibility: { status: "ready" },
    firmware: {
      sketch: "void setup() {}",
      flash: { status: "failed" },
    },
    progress: { completedRoutes: throughCode },
  };

  assert.equal(resolveRoute("/build/test/automatic", base).path, "/build/code");
  assert.equal(
    resolveRoute("/build/test/automatic", {
      ...base,
      firmware: {
        ...base.firmware,
        flash: { status: "success", boardName: "ESP32-S3" },
      },
    }).path,
    "/build/test/automatic",
  );
});
