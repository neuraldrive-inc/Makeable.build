import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { getBoardProfile, supportedBoardSummary } from "./lib/board-profiles.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const initialEnv = getEnv();
const port = Number(initialEnv.PORT || 8787);
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_SKETCH_BYTES = 96 * 1024;
const MAX_CONCURRENT_COMPILES = Math.max(1, Number(initialEnv.MAX_CONCURRENT_COMPILES || 2));
const ARDUINO_COMPILE_JOBS = Math.max(1, Number(initialEnv.ARDUINO_COMPILE_JOBS || 1));
const COMPILE_TIMEOUT_MS = Math.max(30000, Number(initialEnv.COMPILE_TIMEOUT_MS || 240000));
let activeCompiles = 0;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
]);

const server = createServer(async (req, res) => {
  try {
    const env = getEnv();
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    applyCors(req, res, env);
    if (req.method === "OPTIONS") return sendText(res, "", "text/plain; charset=utf-8", 204);

    if (url.pathname === "/config.local.js") {
      return sendText(res, publicConfigScript(env), "text/javascript; charset=utf-8");
    }

    if (url.pathname === "/api/config") {
      return sendJson(res, publicConfig(env));
    }

    if (url.pathname === "/api/deepgram/token" && req.method === "POST") {
      return createDeepgramToken(res, env);
    }

    if (url.pathname === "/api/openai/responses" && req.method === "POST") {
      return proxyOpenAI(req, res, env);
    }

    if (url.pathname === "/api/openai/background" && req.method === "POST") {
      return createOpenAIBackgroundResponse(req, res, env);
    }

    const responseMatch = url.pathname.match(/^\/api\/openai\/responses\/([^/]+)$/);
    if (responseMatch && req.method === "GET") {
      return retrieveOpenAIResponse(responseMatch[1], res, env);
    }

    if (url.pathname === "/api/esp32/status") {
      return esp32Status(req, res, env);
    }

    if (url.pathname === "/api/firmware/compile" && req.method === "POST") {
      return compileFirmware(req, res, env);
    }

    if (url.pathname === "/api/github/repos" && req.method === "POST") {
      return createGitHubRepo(req, res, env);
    }

    if (url.pathname === "/api/github/upload-file" && req.method === "POST") {
      return uploadGitHubFile(req, res, env);
    }

    if (url.pathname === "/api/health") {
      return sendJson(res, {
        ok: true,
        hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
        hasGithubToken: Boolean(env.GITHUB_TOKEN),
        hasEsp32Compiler: Boolean(findArduinoCli(env)),
        hostedMode: true,
        firmwareCompileSupported: Boolean(findArduinoCli(env)),
        supportedBoards: supportedBoardSummary(),
      });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: String(error.message || error) }, 500);
  }
});

server.listen(port, () => {
  console.log(`Makeable running at http://localhost:${port}`);
});

function getEnv() {
  return { ...readEnv(path.join(__dirname, ".env")), ...process.env };
}

function readEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf8");
  const output = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}

function publicConfig(env) {
  const config = {
    githubOwner: env.GITHUB_OWNER || "",
    openaiModel: env.OPENAI_MODEL || "gpt-5.6-sol",
    openaiReasoningModel: env.OPENAI_REASONING_MODEL || "gpt-5.6-sol",
    openaiReasoningEffort: env.OPENAI_REASONING_EFFORT || "high",
    hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
    hasGithubToken: Boolean(env.GITHUB_TOKEN),
    hasEsp32Compiler: Boolean(findArduinoCli(env)),
    hasVoice: Boolean(env.DEEPGRAM_API_KEY),
    hostedMode: true,
    firmwareCompileSupported: Boolean(findArduinoCli(env)),
    supportedBoards: supportedBoardSummary(),
  };
  return config;
}

function applyCors(req, res, env) {
  const origin = String(req.headers.origin || "");
  const configured = String(env.ALLOWED_ORIGINS || "https://makeable.build,https://www.makeable.build")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (configured.includes(origin) || localOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
}

async function createDeepgramToken(res, env) {
  if (!env.DEEPGRAM_API_KEY) {
    return sendJson(res, { error: "Voice input is not configured." }, 503);
  }
  const upstream = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: {
      Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  return pipeJson(upstream, res);
}

function publicConfigScript(env) {
  const config = publicConfig(env);
  return `window.MAKEABLE_CONFIG = ${JSON.stringify(config)};`;
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(__dirname, safePath));
  const relativePath = path.relative(__dirname, filePath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    path.basename(filePath).startsWith(".")
  ) {
    return sendText(res, "Not found", "text/plain; charset=utf-8", 404);
  }

  try {
    const data = await readFile(filePath);
    const contentType = mimeTypes.get(path.extname(filePath)) || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    sendText(res, "Not found", "text/plain; charset=utf-8", 404);
  }
}

async function proxyOpenAI(req, res, env) {
  if (!env.OPENAI_API_KEY) return sendJson(res, { error: "OPENAI_API_KEY is missing in .env" }, 401);

  const body = await readJsonBody(req);
  body.model = env.OPENAI_MODEL || "gpt-5.6-sol";

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: openAIHeaders(env),
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
  });
  res.end(text);
}

async function createOpenAIBackgroundResponse(req, res, env) {
  if (!env.OPENAI_API_KEY) return sendJson(res, { error: "OPENAI_API_KEY is missing in .env" }, 401);

  const body = await readJsonBody(req);
  const payload = {
    ...body,
    model: env.OPENAI_REASONING_MODEL || env.OPENAI_MODEL || "gpt-5.6-sol",
    background: true,
    store: body.store ?? true,
  };
  delete payload.stream;

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: openAIHeaders(env),
    body: JSON.stringify(payload),
  });
  return pipeJson(upstream, res);
}

async function retrieveOpenAIResponse(responseId, res, env) {
  if (!env.OPENAI_API_KEY) return sendJson(res, { error: "OPENAI_API_KEY is missing in .env" }, 401);

  const id = encodeURIComponent(decodeURIComponent(responseId));
  const upstream = await fetch(`https://api.openai.com/v1/responses/${id}`, {
    headers: openAIHeaders(env),
  });
  return pipeJson(upstream, res);
}

function openAIHeaders(env) {
  return {
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function esp32Status(req, res, env) {
  const cliPath = findArduinoCli(env);
  if (!cliPath) {
    return sendJson(res, {
      hasEsp32Compiler: false,
      hasEsp32Core: false,
      hostedMode: true,
      firmwareCompileSupported: false,
      message: "The hosted firmware compiler is temporarily unavailable.",
    });
  }

  try {
    const [versionResult, coreResult] = await Promise.all([
      execFileAsync(cliPath, ["version"], { timeout: 15000, maxBuffer: 2 * 1024 * 1024 }),
      execFileAsync(cliPath, ["core", "list"], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }),
    ]);
    return sendJson(res, {
      hasEsp32Compiler: true,
      hasEsp32Core: /\besp32:esp32\b/.test(coreResult.stdout),
      hostedMode: true,
      firmwareCompileSupported: true,
      supportedBoards: supportedBoardSummary(),
      version: versionResult.stdout.trim(),
      cores: coreResult.stdout.trim(),
    });
  } catch (error) {
    return sendJson(
      res,
      {
        hasEsp32Compiler: true,
        hasEsp32Core: false,
        error: error.message,
        stderr: error.stderr || "",
      },
      500,
    );
  }
}

async function compileFirmware(req, res, env) {
  const cliPath = findArduinoCli(env);
  if (!cliPath) {
    return sendJson(res, { error: "The hosted firmware compiler is temporarily unavailable." }, 503);
  }

  if (activeCompiles >= MAX_CONCURRENT_COMPILES) {
    res.setHeader("Retry-After", "5");
    return sendJson(res, { error: "The compiler is busy. Please retry in a few seconds." }, 429);
  }

  const body = await readJsonBody(req, MAX_REQUEST_BYTES);
  const sketch = String(body.sketch || "").trim();
  if (!sketch) return sendJson(res, { error: "sketch is required" }, 400);
  if (Buffer.byteLength(sketch, "utf8") > MAX_SKETCH_BYTES) {
    return sendJson(res, { error: "The generated firmware is too large to compile safely." }, 413);
  }

  const profile = getBoardProfile(body.boardProfile || body.fqbn || "esp32");
  if (!profile) return sendJson(res, { error: "Unsupported board profile." }, 400);
  const fqbn = profile.fqbn;
  const sketchName = "MakeableSketch";
  const buildRoot = path.join(__dirname, ".makeable", "builds", randomUUID());
  const sketchDir = path.join(buildRoot, sketchName);
  const outputDir = path.join(buildRoot, "out");

  activeCompiles += 1;

  try {
    await mkdir(sketchDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(sketchDir, `${sketchName}.ino`), sketch, "utf8");
    const args = [
      "compile",
      "--jobs",
      String(ARDUINO_COMPILE_JOBS),
      "--fqbn",
      fqbn,
      "--output-dir",
      outputDir,
      "--export-binaries",
      sketchDir,
    ];
    const compileResult = await execFileAsync(cliPath, args, {
      cwd: buildRoot,
      timeout: COMPILE_TIMEOUT_MS,
      maxBuffer: 24 * 1024 * 1024,
    });
    const images = await collectFirmwareImages(outputDir, sketchName);
    if (!images.length) {
      return sendJson(
        res,
        {
          error: "Compile succeeded, but no flashable .bin files were found.",
          stdout: compileResult.stdout,
          stderr: compileResult.stderr,
        },
        500,
      );
    }
    return sendJson(res, {
      ok: true,
      board: profile.id,
      fqbn: profile.fqbn,
      images,
      compiler: "arduino-cli",
    });
  } catch (error) {
    console.error("Firmware compile failed", error.stderr || error.message);
    return sendJson(
      res,
      {
        error: "The generated firmware did not compile for this board.",
        details: sanitizeCompilerError(error.stderr || error.message),
      },
      500,
    );
  } finally {
    activeCompiles -= 1;
    await rm(buildRoot, { recursive: true, force: true });
  }
}

function sanitizeCompilerError(value) {
  return String(value || "")
    .replaceAll(__dirname, "<workspace>")
    .replace(/\/[^\s:]+\/\.makeable\/builds\/[^\s:]+/g, "<build>")
    .slice(-4000);
}

function findArduinoCli(env) {
  const candidates = [
    env.ARDUINO_CLI_PATH,
    path.join(__dirname, ".makeable/toolchain/bin/arduino-cli"),
    "/opt/homebrew/bin/arduino-cli",
    "/usr/local/bin/arduino-cli",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

async function collectFirmwareImages(outputDir, sketchName) {
  const files = await walkFiles(outputDir);
  const binFiles = files.filter((filePath) => filePath.endsWith(".bin"));
  const merged = findByPattern(binFiles, [/\.merged\.bin$/i, /\.factory\.bin$/i, /merged/i]);
  if (merged) return [await firmwareImage(merged, 0x0, "Merged ESP32 firmware")];
  const bootloader = findByPattern(binFiles, [/bootloader.*\.bin$/i]);
  const partitions = findByPattern(binFiles, [/\.partitions\.bin$/i, /partitions.*\.bin$/i]);
  const bootApp0 = findByPattern(binFiles, [/boot_app0\.bin$/i]) || findBootApp0Bin();
  const app =
    findByPattern(binFiles, [new RegExp(`${sketchName}\\.ino\\.bin$`, "i")]) ||
    findByPattern(binFiles, [/\.ino\.bin$/i]);

  const images = [];
  if (bootloader) images.push(await firmwareImage(bootloader, 0x1000, "Bootloader"));
  if (partitions) images.push(await firmwareImage(partitions, 0x8000, "Partition table"));
  if (bootApp0) images.push(await firmwareImage(bootApp0, 0xe000, "Boot app"));
  if (app) images.push(await firmwareImage(app, 0x10000, "Application"));
  if (images.length) return images;

  return [];
}

async function walkFiles(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await walkFiles(entryPath)));
    } else {
      output.push(entryPath);
    }
  }
  return output;
}

function findByPattern(files, patterns) {
  return files.find((filePath) => patterns.some((pattern) => pattern.test(path.basename(filePath))));
}

function findBootApp0Bin() {
  const home = process.env.HOME || "";
  const candidates = [
    path.join(home, "Library/Arduino15/packages/esp32/hardware/esp32/3.3.5/tools/partitions/boot_app0.bin"),
    path.join(home, "Library/Arduino15/packages/arduino/hardware/esp32/2.0.18-arduino.5/tools/partitions/boot_app0.bin"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

async function firmwareImage(filePath, address, label) {
  const data = await readFile(filePath);
  return {
    name: path.basename(filePath),
    label,
    address,
    size: data.length,
    dataBase64: data.toString("base64"),
  };
}

async function createGitHubRepo(req, res, env) {
  if (!env.GITHUB_TOKEN) {
    return sendJson(res, { error: "GITHUB_TOKEN is missing in .env" }, 401);
  }
  const body = await readJsonBody(req);
  const upstream = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: githubHeaders(env),
    body: JSON.stringify({
      name: body.name,
      description: body.description || "Hardware project generated with Makeable",
      private: Boolean(body.private),
      auto_init: false,
    }),
  });
  return pipeJson(upstream, res);
}

async function uploadGitHubFile(req, res, env) {
  if (!env.GITHUB_TOKEN) {
    return sendJson(res, { error: "GITHUB_TOKEN is missing in .env" }, 401);
  }
  const body = await readJsonBody(req);
  const owner = body.owner || env.GITHUB_OWNER;
  const repo = body.repo;
  const filePath = body.path;
  if (!owner || !repo || !filePath) {
    return sendJson(res, { error: "owner, repo, and path are required" }, 400);
  }

  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const branchQuery = body.branch ? `?ref=${encodeURIComponent(body.branch)}` : "";
  let sha;
  const existing = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}${branchQuery}`,
    { headers: githubHeaders(env) },
  );
  if (existing.ok) {
    const existingJson = await existing.json();
    sha = existingJson.sha;
  } else if (existing.status !== 404) {
    return pipeJson(existing, res);
  }

  const payload = {
    message: body.message || `Update ${filePath}`,
    content: Buffer.from(body.content || "", "utf8").toString("base64"),
    ...(body.branch ? { branch: body.branch } : {}),
    ...(sha ? { sha } : {}),
  };

  const upstream = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`,
    {
      method: "PUT",
      headers: githubHeaders(env),
      body: JSON.stringify(payload),
    },
  );
  return pipeJson(upstream, res);
}

function githubHeaders(env) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function pipeJson(upstream, res) {
  const text = await upstream.text();
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
  });
  res.end(text);
}

async function readJsonBody(req, maxBytes = MAX_REQUEST_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, data, status = 200) {
  sendText(res, JSON.stringify(data), "application/json; charset=utf-8", status);
}

function sendText(res, text, contentType, status = 200) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(text);
}
