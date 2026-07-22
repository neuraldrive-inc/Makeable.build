import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
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

test("an oversized asynchronous request returns 413 without terminating the server", async (t) => {
  const port = await availablePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
    },
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

  const deadline = Date.now() + 8_000;
  while (!stdout.includes("Makeable running at") && child.exitCode === null) {
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(child.exitCode, null, stderr || "Server exited before becoming ready.");
  assert.match(stdout, /Makeable running at/);

  const oversized = await fetch(`http://127.0.0.1:${port}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential: "a".repeat(21 * 1024),
      intent: "waitlist",
    }),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "Request body is too large." });

  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  assert.equal(child.exitCode, null, stderr || "Server exited after rejecting the request.");
});

async function availablePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  probe.close();
  await once(probe, "close");
  return port;
}
