import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  createPublicConfig,
  createPublicConfigScript,
  createPublishCapability,
  GITHUB_MAX_REQUEST_BYTES,
  grantDeepgramToken,
  repositoryMatchesRecoverySecret,
  safeGitHubRepositoryMetadata,
  validateGitHubRecoveryRequest,
  validateGitHubRepositoryRequest,
  validateGitHubUploadRequest,
  verifyPublishCapability,
} from "./src/makeable/server-contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const fileEnv = readEnv(path.join(__dirname, ".env"));
const initialEnv = getEnv();
const port = Number(initialEnv.PORT || 8787);

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
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);
const publicRootFiles = new Set(["index.html", "app.js", "styles.css"]);
const publicDirectoryRoots = new Map([
  ["assets", path.join(__dirname, "assets")],
  ["src", path.join(__dirname, "src", "makeable")],
  ["styles", path.join(__dirname, "styles")],
]);

const server = createServer(async (req, res) => {
  try {
    const env = getEnv();
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

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

    if (url.pathname === "/api/arduino/status") {
      return arduinoStatus(req, res, env);
    }

    if (url.pathname === "/api/firmware/compile" && req.method === "POST") {
      return compileFirmware(req, res, env);
    }

    if (url.pathname === "/api/github/repos" && req.method === "POST") {
      return createGitHubRepo(req, res, env);
    }

    if (
      url.pathname === "/api/github/repository-recovery" &&
      req.method === "POST"
    ) {
      return recoverGitHubRepository(req, res, env);
    }

    if (url.pathname === "/api/github/upload-file" && req.method === "POST") {
      return uploadGitHubFile(req, res, env);
    }

    if (url.pathname === "/api/health") {
      return sendJson(res, {
        ok: true,
        hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
        hasDeepgramKey: Boolean(env.DEEPGRAM_API_KEY),
        hasGithubToken: Boolean(env.GITHUB_TOKEN),
        hasArduinoCli: Boolean(findArduinoCli(env)),
      });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    const status =
      Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    return sendJson(
      res,
      {
        error:
          status === 500
            ? "The Makeable server could not complete the request."
            : String(error.message || error),
      },
      status,
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Makeable running at http://127.0.0.1:${port}`);
});
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

function getEnv() {
  return { ...fileEnv, ...process.env };
}

function shutdown() {
  server.close((error) => {
    if (!error) return;
    console.error(error);
    process.exitCode = 1;
  });
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
  return createPublicConfig(env, {
    hasArduinoCli: Boolean(findArduinoCli(env)),
  });
}

function publicConfigScript(env) {
  return createPublicConfigScript(publicConfig(env));
}

async function createDeepgramToken(res, env) {
  const result = await grantDeepgramToken(env.DEEPGRAM_API_KEY);
  return sendJson(res, result.body, result.status, { "Cache-Control": "no-store" });
}

async function serveStatic(pathname, res) {
  const filePath = resolvePublicFile(pathname);
  if (!filePath) {
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

function resolvePublicFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return "";
  }
  const segments = decoded.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    return "";
  }
  if (pathname === "/" || pathname.startsWith("/build/")) {
    return path.join(__dirname, "index.html");
  }
  if (!segments.length) return "";
  if (segments.length === 1 && publicRootFiles.has(segments[0])) {
    return path.join(__dirname, segments[0]);
  }

  const [publicRoot, ...relativeSegments] = segments;
  const allowedRoot =
    publicRoot === "src"
      ? relativeSegments.shift() === "makeable"
        ? publicDirectoryRoots.get("src")
        : ""
      : publicDirectoryRoots.get(publicRoot);
  if (!allowedRoot || !relativeSegments.length) return "";

  const filePath = path.resolve(allowedRoot, ...relativeSegments);
  const relativePath = path.relative(allowedRoot, filePath);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return "";
  }
  return filePath;
}

async function proxyOpenAI(req, res, env) {
  if (!env.OPENAI_API_KEY) return sendJson(res, { error: "OPENAI_API_KEY is missing in .env" }, 401);

  const body = await readJsonBody(req);
  if (!body.model) body.model = env.OPENAI_MODEL || "gpt-5.5";

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
    model: body.model || env.OPENAI_MODEL || "gpt-5.5",
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

async function arduinoStatus(req, res, env) {
  const cliPath = findArduinoCli(env);
  if (!cliPath) {
    return sendJson(res, {
      hasArduinoCli: false,
      hasEsp32Core: false,
      message:
        "arduino-cli was not found. Install Arduino IDE or set ARDUINO_CLI_PATH in .env.",
    });
  }

  try {
    const [versionResult, coreResult] = await Promise.all([
      execFileAsync(cliPath, ["version"], { timeout: 15000, maxBuffer: 2 * 1024 * 1024 }),
      execFileAsync(cliPath, ["core", "list"], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }),
    ]);
    return sendJson(res, {
      hasArduinoCli: true,
      hasEsp32Core: /\besp32:esp32\b/.test(coreResult.stdout),
      fqbn: env.ARDUINO_FQBN || "esp32:esp32:esp32",
      version: versionResult.stdout.trim(),
      cores: coreResult.stdout.trim(),
    });
  } catch (error) {
    return sendJson(
      res,
      {
        hasArduinoCli: true,
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
    return sendJson(res, { error: "arduino-cli was not found. Set ARDUINO_CLI_PATH in .env." }, 501);
  }

  const body = await readJsonBody(req);
  const sketch = String(body.sketch || "").trim();
  if (!sketch) return sendJson(res, { error: "sketch is required" }, 400);

  const fqbn = String(body.fqbn || env.ARDUINO_FQBN || "esp32:esp32:esp32").trim();
  const sketchName = "MakeableSketch";
  const buildRoot = path.join(__dirname, ".makeable", "builds", randomUUID());
  const sketchDir = path.join(buildRoot, sketchName);
  const outputDir = path.join(buildRoot, "out");

  await mkdir(sketchDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(sketchDir, `${sketchName}.ino`), sketch, "utf8");

  try {
    const args = [
      "compile",
      "--fqbn",
      fqbn,
      "--output-dir",
      outputDir,
      "--export-binaries",
      sketchDir,
    ];
    const compileResult = await execFileAsync(cliPath, args, {
      cwd: buildRoot,
      timeout: 180000,
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
      fqbn,
      images,
      stdout: compileResult.stdout,
      stderr: compileResult.stderr,
    });
  } catch (error) {
    return sendJson(
      res,
      {
        error: error.message,
        stdout: error.stdout || "",
        stderr: error.stderr || "",
        hint:
          "If this mentions esp32:esp32, open Arduino IDE once or install the ESP32 boards core with Arduino CLI.",
      },
      500,
    );
  } finally {
    await rm(buildRoot, { recursive: true, force: true });
  }
}

function findArduinoCli(env) {
  const candidates = [
    env.ARDUINO_CLI_PATH,
    "/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli",
    "/Applications/Arduino.app/Contents/MacOS/arduino-cli",
    "/opt/homebrew/bin/arduino-cli",
    "/usr/local/bin/arduino-cli",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

async function collectFirmwareImages(outputDir, sketchName) {
  const files = await walkFiles(outputDir);
  const binFiles = files.filter((filePath) => filePath.endsWith(".bin"));
  const merged =
    findByPattern(binFiles, [
      new RegExp(`${sketchName}\\.ino\\.merged\\.bin$`, "i"),
      /\.merged\.bin$/i,
      /\.factory\.bin$/i,
    ]);
  return merged ? [await firmwareImage(merged, 0x0, "Merged ESP32 firmware")] : [];
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
  const body = await readJsonBody(req, GITHUB_MAX_REQUEST_BYTES);
  const validation = validateGitHubRepositoryRequest(body, env.GITHUB_OWNER);
  if (!validation.ok) {
    return sendJson(res, { error: validation.error }, validation.status);
  }
  const repository = validation.value;
  const upstream = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: githubHeaders(env),
    body: JSON.stringify({
      name: repository.name,
      description: repository.description,
      private: repository.private,
      auto_init: false,
    }),
  });
  if (!upstream.ok) return pipeJson(upstream, res);
  const metadata = safeGitHubRepositoryMetadata(
    await upstream.json(),
    repository.owner,
    repository.name,
  );
  if (!metadata) {
    return sendJson(res, { error: "GitHub returned unverified repository metadata." }, 502);
  }
  const issued = createPublishCapability(
    { owner: metadata.owner, repo: metadata.name },
    env.GITHUB_TOKEN,
  );
  return sendJson(
    res,
    {
      ...metadata,
      publishCapability: issued.capability,
      capabilityExpiresAt: issued.expiresAt,
    },
    201,
  );
}

async function recoverGitHubRepository(req, res, env) {
  if (!env.GITHUB_TOKEN) {
    return sendJson(res, { error: "GITHUB_TOKEN is missing in .env" }, 401);
  }
  const body = await readJsonBody(req, GITHUB_MAX_REQUEST_BYTES);
  const validation = validateGitHubRecoveryRequest(
    body,
    env.GITHUB_OWNER,
  );
  if (!validation.ok) {
    return sendJson(res, { error: validation.error }, validation.status);
  }
  const { owner, repo, recoverySecret } = validation.value;
  const upstream = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}`,
    { headers: githubHeaders(env) },
  );
  if (!upstream.ok) {
    return sendJson(
      res,
      {
        error:
          upstream.status === 404
            ? "Repository was not verified."
            : "GitHub could not verify the repository.",
      },
      upstream.status === 404 ? 404 : 502,
    );
  }
  const repository = await upstream.json();
  const metadata = safeGitHubRepositoryMetadata(repository, owner, repo);
  if (
    !metadata ||
    !repositoryMatchesRecoverySecret(repository.description, recoverySecret)
  ) {
    return sendJson(
      res,
      {
        error:
          "This repository cannot be recovered safely. Choose a new repository name.",
      },
      403,
    );
  }
  const issued = createPublishCapability(
    { owner: metadata.owner, repo: metadata.name },
    env.GITHUB_TOKEN,
  );
  return sendJson(res, {
    ...metadata,
    publishCapability: issued.capability,
    capabilityExpiresAt: issued.expiresAt,
  });
}

async function uploadGitHubFile(req, res, env) {
  if (!env.GITHUB_TOKEN) {
    return sendJson(res, { error: "GITHUB_TOKEN is missing in .env" }, 401);
  }
  const body = await readJsonBody(req, GITHUB_MAX_REQUEST_BYTES);
  const validation = validateGitHubUploadRequest(body, env.GITHUB_OWNER);
  if (!validation.ok) {
    return sendJson(res, { error: validation.error }, validation.status);
  }
  const {
    owner,
    repo,
    path: filePath,
    content,
    capability,
  } = validation.value;
  const authorization = verifyPublishCapability(
    capability,
    { owner, repo, path: filePath },
    env.GITHUB_TOKEN,
  );
  if (!authorization.ok) {
    return sendJson(res, { error: authorization.error }, 403);
  }

  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  let sha;
  const existing = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(
      owner,
    )}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
    { headers: githubHeaders(env) },
  );
  if (existing.ok) {
    const existingJson = await existing.json();
    if (typeof existingJson.sha !== "string" || !existingJson.sha) {
      return sendJson(res, { error: "GitHub returned invalid file metadata." }, 502);
    }
    sha = existingJson.sha;
  } else if (existing.status !== 404) {
    return pipeJson(existing, res);
  }

  const payload = {
    message: `Update ${filePath} from Makeable`,
    content: Buffer.from(content, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  };

  const upstream = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(
      owner,
    )}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
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

async function readJsonBody(req, maxBytes = 4 * 1024 * 1024) {
  const advertisedLength = Number(req.headers["content-length"]);
  if (
    Number.isFinite(advertisedLength) &&
    advertisedLength > maxBytes
  ) {
    throw requestError("Request body is too large.", 413);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw requestError("Request body is too large.", 413);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw requestError("Request body must be valid JSON.", 400);
  }
}

function requestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(res, data, status = 200, headers = {}) {
  sendText(res, JSON.stringify(data), "application/json; charset=utf-8", status, headers);
}

function sendText(res, text, contentType, status = 200, headers = {}) {
  res.writeHead(status, { "Content-Type": contentType, ...headers });
  res.end(text);
}
