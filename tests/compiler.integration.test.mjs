import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = process.env.MAKEABLE_TEST_ARDUINO_CLI;

test("hosted compiler produces a merged ESP32 image and blocks arbitrary targets", { skip: !cliPath }, async (t) => {
  const port = 18787;
  const toolchain = path.resolve(root, ".makeable/toolchain");
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ARDUINO_CLI_PATH: cliPath,
      ARDUINO_DIRECTORIES_DATA: path.join(toolchain, "data"),
      ARDUINO_DIRECTORIES_DOWNLOADS: path.join(toolchain, "downloads"),
      ARDUINO_DIRECTORIES_USER: path.join(toolchain, "user"),
      NODE_ENV: "test",
      MAKEABLE_TEST_AUTH_BYPASS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));

  const base = `http://127.0.0.1:${port}`;
  await waitForServer(`${base}/api/health`);

  const statusResponse = await fetch(`${base}/api/esp32/status`);
  const status = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.equal(status.hasEsp32Core, true);
  assert.equal(status.hostedMode, true);

  const compileResponse = await fetch(`${base}/api/firmware/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      boardProfile: "esp32",
      sketch: "void setup() { pinMode(2, OUTPUT); }\nvoid loop() { digitalWrite(2, !digitalRead(2)); delay(100); }",
    }),
  });
  const compiled = await compileResponse.json();
  assert.equal(compileResponse.status, 200, JSON.stringify(compiled));
  assert.equal(compiled.board, "esp32");
  assert.equal(compiled.images.length, 1);
  assert.equal(compiled.images[0].address, 0);
  assert.ok(compiled.images[0].size > 100_000);
  assert.ok(compiled.images[0].dataBase64.length > compiled.images[0].size);
  assert.equal("stdout" in compiled, false);

  const invalidResponse = await fetch(`${base}/api/firmware/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      boardProfile: "esp32",
      sketch: "void setup() { makeableUndefinedCall(); }\nvoid loop() {}",
    }),
  });
  const invalid = await invalidResponse.json();
  assert.equal(invalidResponse.status, 500);
  assert.match(invalid.details, /makeableUndefinedCall/);
  assert.match(invalid.details, /(not declared|was not declared)/i);
  assert.doesNotMatch(invalid.details, /build-cache-path has been deprecated/i);

  const blockedResponse = await fetch(`${base}/api/firmware/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boardProfile: "attacker:board", sketch: "void setup(){} void loop(){}" }),
  });
  assert.equal(blockedResponse.status, 400);
});

async function waitForServer(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start.");
}
