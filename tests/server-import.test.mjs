import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the local server imports and starts without module-linking errors", async (t) => {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout = `${stdout}${chunk}`.slice(-8_000);
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGTERM");
  });

  const exitPromise = once(child, "exit");
  const deadline = Date.now() + 8_000;
  while (!stdout.includes("Makeable running at") && child.exitCode === null) {
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.equal(child.exitCode, null, stderr || "Server exited before becoming ready.");
  assert.match(stdout, /Makeable running at/);
  child.kill("SIGTERM");
  await exitPromise;
  assert.doesNotMatch(stderr, /SyntaxError|does not provide an export/);
});
