import test from "node:test";
import assert from "node:assert/strict";
import { getBoardProfile, selectBoardProfile, supportedBoardSummary } from "../lib/board-profiles.mjs";

test("compiler targets are restricted to supported profiles", () => {
  assert.equal(getBoardProfile("esp32:esp32:esp32c3")?.id, "esp32c3");
  assert.equal(getBoardProfile("attacker:arbitrary:board"), null);
  assert.equal(supportedBoardSummary().length, 5);
});

test("board profile is inferred from the recognized hardware", () => {
  assert.equal(selectBoardProfile({ parts: [{ name: "ESP32-S3 DevKitC" }] }).id, "esp32s3");
  assert.equal(selectBoardProfile({ parts: [{ name: "ESP32 C6 board" }] }).id, "esp32c6");
  assert.equal(selectBoardProfile({ parts: [{ name: "ESP32 development board" }] }).id, "esp32");
  assert.equal(selectBoardProfile({ parts: [{ name: "Arduino Uno" }] }), null);
});
