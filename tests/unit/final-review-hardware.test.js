import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

import * as actions from "../../src/makeable/actions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_SKETCH = `
const int PUMP_PIN = 8;
unsigned long pumpOffDeadline = 0;
void reportReset() { Serial.println("MAKEABLE|RESET|POWER_ON"); }
void reportReady() { Serial.println("MAKEABLE|READY|ESP32"); }
void reportCheck() { Serial.println("MAKEABLE|CHECK|pump|PASS|pulse complete"); }
void handleCommand(String line) {
  if (line.startsWith("MAKEABLE|STOP|")) {
    digitalWrite(PUMP_PIN, LOW);
    return;
  }
  if (line.startsWith("MAKEABLE|RUN|")) {
    unsigned long pulseMs = 500;
    pumpOffDeadline = millis() + pulseMs;
    digitalWrite(PUMP_PIN, HIGH);
    reportCheck();
  }
}
void setup() { Serial.begin(115200); reportReset(); reportReady(); }
void loop() {
  if ((long)(millis() - pumpOffDeadline) >= 0) {
    digitalWrite(PUMP_PIN, LOW);
  }
  if (Serial.available()) handleCommand(Serial.readStringUntil('\\n'));
}
`;

let serverProcess;
let baseUrl;
let temporaryDirectory;
let compileLogPath;

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(root, "tmp", "final-review-"));
  compileLogPath = path.join(temporaryDirectory, "compile.jsonl");
  const cliPath = path.join(temporaryDirectory, "fake-arduino-cli.mjs");
  await writeFile(
    cliPath,
    `#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
if (args[0] === "version") {
  console.log("arduino-cli Version: test");
} else if (args[0] === "core" && args[1] === "list") {
  console.log("esp32:esp32 3.3.0");
} else if (args[0] === "compile") {
  const outputDir = args[args.indexOf("--output-dir") + 1];
  const sketchDir = args.at(-1);
  const sketchName = path.basename(sketchDir);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, sketchName + ".ino.merged.bin"), Buffer.from([0, 1, 2, 3]));
  writeFileSync(path.join(outputDir, sketchName + ".ino.bin"), Buffer.from([4, 5, 6, 7]));
  appendFileSync(${JSON.stringify(compileLogPath)}, JSON.stringify({ cwd: process.cwd(), sketchName, args }) + "\\n");
} else {
  process.exitCode = 2;
}
`,
    "utf8",
  );
  await chmod(cliPath, 0o755);
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ARDUINO_CLI_PATH: cliPath,
      ARDUINO_FQBN: "esp32:esp32:esp32s3",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(serverProcess, baseUrl);
});

after(async () => {
  serverProcess?.kill("SIGTERM");
  await new Promise((resolve) => serverProcess?.once("exit", resolve));
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("the local server binds only to loopback and serves an explicit public surface", async () => {
  const serverSource = await readFile(path.join(root, "server.mjs"), "utf8");
  assert.match(serverSource, /server\.listen\(port,\s*"127\.0\.0\.1"/);

  for (const pathname of [
    "/",
    "/build/new",
    "/app.js",
    "/styles/makeable.css",
    "/src/makeable/actions.js",
    "/assets/icons/lucide/check.svg",
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200, `${pathname} should remain public`);
  }

  for (const pathname of [
    "/.git/config",
    "/.geckco-ai/builds/private.bin",
    "/assets/.secret",
    "/build/.secret",
    "/test.md",
    "/README.md",
    "/%2eenv",
    "/assets/%2e%2e/server.mjs",
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 404, `${pathname} must not be public`);
  }
});

test("firmware compilation uses a Makeable workspace and Arduino's merged image at offset zero", async () => {
  const response = await fetch(`${baseUrl}/api/firmware/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sketch: CONTRACT_SKETCH,
      fqbn: "esp32:esp32:esp32s3",
    }),
  });
  const compiled = await response.json();

  assert.equal(response.status, 200, JSON.stringify(compiled));
  assert.deepEqual(
    compiled.images.map(({ name, address }) => ({ name, address })),
    [{ name: "MakeableSketch.ino.merged.bin", address: 0 }],
  );
  const compileLog = JSON.parse((await readFile(compileLogPath, "utf8")).trim());
  assert.equal(compileLog.sketchName, "MakeableSketch");
  assert.match(compileLog.cwd, /[/\\]\.makeable[/\\]builds[/\\]/);
  assert.doesNotMatch(compileLog.cwd, /\.geckco-ai/);
});

test("strict wiring plans require the explanation that normalization already preserves", () => {
  const wiringSchema = actions.HARDWARE_PLAN_SCHEMA.properties.wiringSteps.items;
  assert.ok(wiringSchema.required.includes("explanation"));
  assert.equal(wiringSchema.properties.explanation.type, "string");
});

test("AI hardware and manual evidence requests pass the caller AbortSignal to fetch", async () => {
  const controller = new AbortController();
  const seenSignals = [];
  const modelPlan = {
    projectTitle: "Safe build",
    summary: "",
    parts: [],
    feasibility: { status: "ready", reasons: [] },
    missingParts: [],
    alternatives: [],
    wiringSteps: [],
    firmwareSpec: {
      board: "ESP32",
      behavior: "",
      libraries: [],
      pinAssignments: [],
      serialProtocol: [],
    },
    firmware: { language: "Arduino C++", sketch: "", notes: "" },
    diagnostics: {
      warnings: [],
      tests: [],
      manualAction: "Observe it.",
      manualQuestion: "Did it work?",
      manualSuccessLabel: "Yes",
    },
  };
  const fetchImpl = async (_url, init) => {
    seenSignals.push(init.signal);
    return response({
      id: "resp_1",
      output_text:
        seenSignals.length === 1
          ? JSON.stringify(modelPlan)
          : JSON.stringify({
              status: "pass",
              observations: [],
              nextStep: "Done.",
            }),
    });
  };

  await actions.requestHardwarePlan({
    idea: "Make it",
    imageDataUrl: "data:image/jpeg;base64,AA==",
    fetchImpl,
    signal: controller.signal,
  });
  await actions.evaluateManualTest({
    projectTitle: "Safe build",
    requestedAction: "Observe it.",
    imageDataUrl: "data:image/jpeg;base64,AA==",
    fetchImpl,
    signal: controller.signal,
  });

  assert.deepEqual(seenSignals, [controller.signal, controller.signal]);
});

test("actuator diagnostics arm an injected off deadline and always send STOP", async () => {
  const writes = [];
  let scheduledDelay = 0;
  let scheduledOff = Promise.resolve();
  const result = await actions.runSequentialDiagnostics({
    diagnostics: [
      {
        id: "pump",
        name: "Pump spins",
        kind: "actuator",
        pulseMs: 650,
        assemblyStep: 3,
      },
    ],
    session: {
      async write(value) {
        writes.push(value);
      },
      async waitForMarker() {
        await scheduledOff;
        return {
          type: "check",
          id: "pump",
          status: "pass",
          detail: "pulse complete",
        };
      },
      async close() {},
    },
    scheduleDeadline(callback, delayMs) {
      scheduledDelay = delayMs;
      scheduledOff = Promise.resolve().then(callback);
      return 1;
    },
    clearDeadline() {},
  });

  assert.equal(result.status, "pass");
  assert.equal(scheduledDelay, 650);
  assert.deepEqual(writes, [
    "MAKEABLE|RUN|pump|650\n",
    "MAKEABLE|STOP|pump\n",
  ]);
});

test("Web Serial flashes locally vendored esptool with compiled image parameters intact", async () => {
  const actionsSource = await readFile(
    path.join(root, "src", "makeable", "actions.js"),
    "utf8",
  );
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  assert.doesNotMatch(actionsSource, /unpkg\.com|https:\/\/.*esptool/i);
  assert.match(actionsSource, /assets\/vendor\/esptool-js\/bundle\.js/);
  assert.equal(packageJson.dependencies?.["esptool-js"], "0.5.7");
  await assertFile("assets/vendor/esptool-js/bundle.js");
  await assertFile("assets/vendor/esptool-js/LICENSE");
  await assertFile("assets/vendor/esptool-js/licenses/pako-LICENSE");
  await assertFile("assets/vendor/esptool-js/licenses/atob-lite-LICENSE.md");
  await assertFile("assets/vendor/esptool-js/licenses/tslib-LICENSE.txt");

  let writeOptions;
  class Transport {
    async disconnect() {}
  }
  class ESPLoader {
    async main() {
      return "ESP32-S3";
    }
    async writeFlash(options) {
      writeOptions = options;
    }
    async after() {}
  }
  await actions.compileAndFlashFirmware({
    sketch: CONTRACT_SKETCH,
    serial: { requestPort: async () => ({}) },
    fetchImpl: async (url) =>
      url === "/api/arduino/status"
        ? response({ hasArduinoCli: true, hasEsp32Core: true })
        : response({
            ok: true,
            fqbn: "esp32:esp32:esp32s3",
            images: [
              {
                name: "MakeableSketch.ino.merged.bin",
                label: "Merged ESP32 firmware",
                address: 0,
                size: 4,
                dataBase64: "AAECAw==",
              },
            ],
          }),
    loadEsptool: async () => ({ Transport, ESPLoader }),
  });

  assert.equal(writeOptions.flashMode, "keep");
  assert.equal(writeOptions.flashFreq, "keep");
  assert.equal(writeOptions.flashSize, "keep");
  assert.deepEqual(writeOptions.fileArray.map(({ address }) => address), [0]);
});

test("Makeable build work and the legacy migration directory stay out of version control", async () => {
  const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
  const assetReadme = await readFile(path.join(root, "assets", "README.md"), "utf8");

  assert.match(gitignore, /^\.makeable\/$/m);
  assert.match(gitignore, /^\.geckco-ai\/$/m);
  assert.match(assetReadme, /esptool-js@0\.5\.7/);
  assert.match(assetReadme, /Apache(?: License)? 2\.0/i);
});

async function assertFile(relativePath) {
  const data = await readFile(path.join(root, relativePath));
  assert.ok(data.length > 0, `${relativePath} should be non-empty`);
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const socket = createNetServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const { port } = socket.address();
      socket.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(child, url) {
  let stderr = "";
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early: ${stderr}`);
    }
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // The child has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`server did not start: ${stdout} ${stderr}`);
}

function response(body, ok = true) {
  return {
    ok,
    async text() {
      return JSON.stringify(body);
    },
  };
}
