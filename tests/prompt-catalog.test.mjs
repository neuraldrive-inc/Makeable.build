import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the prompt catalogue accounts for every runtime AI request", async () => {
  const [catalogue, pilotSource, mainSource] = await Promise.all([
    readFile(new URL("../docs/AI_PROMPTS.md", import.meta.url), "utf8"),
    readFile(new URL("../pilot/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/makeable/actions.js", import.meta.url), "utf8"),
  ]);

  for (const id of ["P1", "P2", "P3", "P4", "M1", "M2", "M3", "M4", "M5"]) {
    assert.match(catalogue, new RegExp(`## ${id} —`));
  }
  assert.equal((pilotSource.match(/role: "system"/g) || []).length, 4);
  // M1 and M2 share one conditional requestHardwarePlan call.
  assert.equal((mainSource.match(/role: "system"/g) || []).length, 4);
  assert.match(catalogue, /Treat the USB data cable and jumper wires as setup equipment/i);
  assert.match(catalogue, /matching labelled board rail/i);
});
