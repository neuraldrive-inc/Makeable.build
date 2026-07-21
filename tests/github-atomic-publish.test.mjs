import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import test, { after, before, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createPublishCapability } from "../lib/publish-capability.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const githubToken = "atomic-publish-test-secret";
const userId = "compiler-integration-test";

let appProcess;
let appOrigin;
let appStderr = "";
let githubServer;
let githubOrigin;
let githubHandler;

before(async () => {
  githubServer = createHttpServer(async (req, res) => {
    try {
      await githubHandler(req, res);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });
  githubServer.listen(0, "127.0.0.1");
  await once(githubServer, "listening");
  githubOrigin = `http://127.0.0.1:${githubServer.address().port}`;

  const appPort = await availablePort();
  appOrigin = `http://127.0.0.1:${appPort}`;
  appProcess = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(appPort),
      NODE_ENV: "test",
      MAKEABLE_TEST_AUTH_BYPASS: "1",
      GITHUB_TOKEN: githubToken,
      GITHUB_API_ORIGIN: githubOrigin,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  appProcess.stdout.on("data", () => {});
  appProcess.stderr.on("data", (chunk) => {
    appStderr = `${appStderr}${chunk}`.slice(-8_000);
  });
  await waitForServer();
});

beforeEach(() => {
  githubHandler = (_req, res) => sendJson(res, 500, { error: "Unexpected GitHub request" });
});

after(async () => {
  if (appProcess?.exitCode === null) {
    appProcess.kill("SIGTERM");
    await once(appProcess, "exit");
  }
  if (githubServer?.listening) {
    githubServer.close();
    await once(githubServer, "close");
  }
});

test("local config advertises atomic GitHub project publishing", async () => {
  const response = await fetch(`${appOrigin}/api/config`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).githubAtomicPublishSupported, true);
});

test("new project repositories are initialized before atomic publishing", async () => {
  let repositoryRequest;
  githubHandler = async (req, res) => {
    repositoryRequest = { method: req.method, path: req.url, body: await readJson(req) };
    return sendJson(res, 201, {
      name: "first-project",
      owner: { login: "maker" },
      html_url: "https://github.com/maker/first-project",
    });
  };

  const response = await fetch(`${appOrigin}/api/github/repos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "first-project",
      description: "A beginner build",
      private: true,
    }),
  });
  const result = await response.json();

  assert.equal(response.status, 201, JSON.stringify(result));
  assert.deepEqual(repositoryRequest, {
    method: "POST",
    path: "/user/repos",
    body: {
      name: "first-project",
      description: "A beginner build",
      private: true,
      auto_init: true,
    },
  });
  assert.equal(typeof result.publishCapability, "string");
  assert.ok(result.publishCapability.length > 20);
});

test("atomic project publishing fails closed before contacting GitHub", async () => {
  let githubCalls = 0;
  githubHandler = (_req, res) => {
    githubCalls += 1;
    sendJson(res, 500, { error: "should not be called" });
  };

  const response = await fetch(`${appOrigin}/api/github/publish-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "maker",
      repo: "someone-elses-project",
      files: [{ path: "README.md", content: "must not publish" }],
    }),
  });

  assert.equal(response.status, 403);
  assert.match(await response.text(), /authorization is missing or expired/i);
  assert.equal(githubCalls, 0);
});

test("atomic project publishing updates an existing branch with one commit", async () => {
  const calls = [];
  let blobNumber = 0;
  githubHandler = async (req, res) => {
    const body = await readJson(req);
    calls.push({ method: req.method, path: req.url, body });
    if (req.method === "GET" && req.url === "/repos/maker/plant-helper") {
      return sendJson(res, 200, {
        default_branch: "trunk",
        html_url: "https://github.com/maker/plant-helper",
      });
    }
    if (
      req.method === "GET" &&
      req.url === "/repos/maker/plant-helper/git/ref/heads/trunk"
    ) {
      return sendJson(res, 200, { object: { sha: "old-commit" } });
    }
    if (
      req.method === "GET" &&
      req.url === "/repos/maker/plant-helper/git/commits/old-commit"
    ) {
      return sendJson(res, 200, { tree: { sha: "old-tree" } });
    }
    if (req.method === "POST" && req.url === "/repos/maker/plant-helper/git/blobs") {
      blobNumber += 1;
      return sendJson(res, 201, { sha: `blob-${blobNumber}` });
    }
    if (req.method === "POST" && req.url === "/repos/maker/plant-helper/git/trees") {
      return sendJson(res, 201, { sha: "new-tree" });
    }
    if (req.method === "POST" && req.url === "/repos/maker/plant-helper/git/commits") {
      return sendJson(res, 201, { sha: "new-commit" });
    }
    if (
      req.method === "PATCH" &&
      req.url === "/repos/maker/plant-helper/git/refs/heads/trunk"
    ) {
      return sendJson(res, 200, { object: { sha: "new-commit" } });
    }
    return sendJson(res, 404, { error: "unexpected route" });
  };

  const response = await publishProject("plant-helper", [
    { path: "images/finished-build.svg", content: "<svg>beginner photo</svg>" },
    { path: "README.md", content: "# Plant helper" },
  ]);
  const result = await response.json();

  assert.equal(response.status, 200, JSON.stringify(result));
  assert.deepEqual(result, {
    ok: true,
    owner: "maker",
    repo: "plant-helper",
    branch: "trunk",
    commitSha: "new-commit",
    commitUrl: "https://github.com/maker/plant-helper/commit/new-commit",
    files: ["images/finished-build.svg", "README.md"],
  });
  assert.deepEqual(
    calls.map(({ method, path: requestPath }) => `${method} ${requestPath}`),
    [
      "GET /repos/maker/plant-helper",
      "GET /repos/maker/plant-helper/git/ref/heads/trunk",
      "GET /repos/maker/plant-helper/git/commits/old-commit",
      "POST /repos/maker/plant-helper/git/blobs",
      "POST /repos/maker/plant-helper/git/blobs",
      "POST /repos/maker/plant-helper/git/trees",
      "POST /repos/maker/plant-helper/git/commits",
      "PATCH /repos/maker/plant-helper/git/refs/heads/trunk",
    ],
  );
  const blobs = calls.filter(({ path: requestPath }) => requestPath.endsWith("/git/blobs"));
  assert.deepEqual(
    blobs.map(({ body }) => body),
    [
      { content: "<svg>beginner photo</svg>", encoding: "utf-8" },
      { content: "# Plant helper", encoding: "utf-8" },
    ],
  );
  const tree = calls.find(({ path: requestPath }) => requestPath.endsWith("/git/trees"));
  assert.deepEqual(tree.body, {
    base_tree: "old-tree",
    tree: [
      { path: "images/finished-build.svg", mode: "100644", type: "blob", sha: "blob-1" },
      { path: "README.md", mode: "100644", type: "blob", sha: "blob-2" },
    ],
  });
  const commit = calls.find(({ path: requestPath }) => requestPath.endsWith("/git/commits"));
  assert.deepEqual(commit.body, {
    message: "Publish tested Makeable project",
    tree: "new-tree",
    parents: ["old-commit"],
  });
  assert.deepEqual(calls.at(-1).body, { sha: "new-commit", force: false });
});

test("atomic project publishing waits for GitHub to initialize an empty repository", async () => {
  const calls = [];
  githubHandler = async (req, res) => {
    const body = await readJson(req);
    calls.push({ method: req.method, path: req.url, body });
    if (req.method === "GET" && req.url === "/repos/maker/blank-project") {
      return sendJson(res, 200, { default_branch: "main" });
    }
    if (
      req.method === "GET" &&
      req.url === "/repos/maker/blank-project/git/ref/heads/main"
    ) {
      return sendJson(res, 409, { message: "Git Repository is empty." });
    }
    return sendJson(res, 404, { error: "unexpected route" });
  };

  const response = await publishProject("blank-project", [
    { path: "README.md", content: "# First commit" },
  ]);
  assert.equal(response.status, 409);
  assert.match(await response.text(), /not initialized yet/i);
  assert.deepEqual(
    calls.map(({ method, path: requestPath }) => `${method} ${requestPath}`),
    [
      "GET /repos/maker/blank-project",
      "GET /repos/maker/blank-project/git/ref/heads/main",
    ],
  );
});

test("a file failure never advances the repository reference", async () => {
  const calls = [];
  let blobNumber = 0;
  githubHandler = async (req, res) => {
    const body = await readJson(req);
    calls.push({ method: req.method, path: req.url, body });
    if (req.method === "GET" && req.url === "/repos/maker/private-proof") {
      return sendJson(res, 200, { default_branch: "main" });
    }
    if (
      req.method === "GET" &&
      req.url === "/repos/maker/private-proof/git/ref/heads/main"
    ) {
      return sendJson(res, 200, { object: { sha: "old-commit" } });
    }
    if (
      req.method === "GET" &&
      req.url === "/repos/maker/private-proof/git/commits/old-commit"
    ) {
      return sendJson(res, 200, { tree: { sha: "old-tree" } });
    }
    if (req.method === "POST" && req.url === "/repos/maker/private-proof/git/blobs") {
      blobNumber += 1;
      if (blobNumber === 2) return sendJson(res, 503, { error: "simulated blob failure" });
      return sendJson(res, 201, { sha: "unreferenced-blob" });
    }
    return sendJson(res, 500, { error: "a reference-changing endpoint was reached" });
  };

  const response = await publishProject("private-proof", [
    { path: "images/finished-build.svg", content: "<svg>sensitive evidence</svg>" },
    { path: "README.md", content: "# Project notes" },
  ]);

  assert.equal(response.status, 503);
  assert.match(await response.text(), /simulated blob failure/);
  assert.equal(calls.some(({ path: requestPath }) => requestPath.endsWith("/git/trees")), false);
  assert.equal(calls.some(({ path: requestPath }) => requestPath.endsWith("/git/commits")), false);
  assert.equal(calls.some(({ path: requestPath }) => requestPath.includes("/git/refs")), false);
});

test("atomic project publishing rejects duplicate or traversing file paths", async () => {
  let githubCalls = 0;
  githubHandler = (_req, res) => {
    githubCalls += 1;
    sendJson(res, 500, { error: "should not be called" });
  };
  for (const files of [
    [
      { path: "README.md", content: "one" },
      { path: "README.md", content: "two" },
    ],
    [{ path: "evidence/../README.md", content: "unsafe" }],
  ]) {
    const response = await publishProject("safe-project", files);
    assert.equal(response.status, 400);
  }
  assert.equal(githubCalls, 0);
});

test("atomic project publishing rejects files outside the artifact allowlist", async () => {
  let githubCalls = 0;
  githubHandler = (_req, res) => {
    githubCalls += 1;
    sendJson(res, 500, { error: "should not be called" });
  };

  const response = await publishProject("safe-project", [
    { path: ".github/workflows/pwn.yml", content: "name: unexpected" },
  ]);

  assert.equal(response.status, 400);
  assert.match(await response.text(), /not an allowed Makeable project artifact/i);
  assert.equal(githubCalls, 0);
});

test("single-file GitHub publishing uploads an allowed legacy artifact", async () => {
  const calls = [];
  githubHandler = async (req, res) => {
    const body = await readJson(req);
    calls.push({ method: req.method, path: req.url, body });
    if (
      req.method === "GET" &&
      req.url === "/repos/maker/legacy-project/contents/build-guide/README.md"
    ) {
      return sendJson(res, 404, { message: "Not Found" });
    }
    if (
      req.method === "PUT" &&
      req.url === "/repos/maker/legacy-project/contents/build-guide/README.md"
    ) {
      return sendJson(res, 201, { content: { path: "build-guide/README.md" } });
    }
    return sendJson(res, 500, { error: "unexpected route" });
  };
  const repo = "legacy-project";
  const publishCapability = createPublishCapability(
    { userId, owner: "maker", repositoryName: repo },
    githubToken,
  );

  const response = await fetch(`${appOrigin}/api/github/upload-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "maker",
      repo,
      path: "build-guide/README.md",
      content: "# Build guide",
      message: "Update build-guide/README.md from Makeable",
      publishCapability,
    }),
  });
  const result = await response.json();

  assert.equal(response.status, 201, JSON.stringify(result));
  assert.deepEqual(calls, [
    {
      method: "GET",
      path: "/repos/maker/legacy-project/contents/build-guide/README.md",
      body: undefined,
    },
    {
      method: "PUT",
      path: "/repos/maker/legacy-project/contents/build-guide/README.md",
      body: {
        message: "Update build-guide/README.md from Makeable",
        content: Buffer.from("# Build guide", "utf8").toString("base64"),
      },
    },
  ]);
});

test("single-file GitHub publishing rejects files outside the artifact allowlist", async () => {
  let githubCalls = 0;
  githubHandler = (_req, res) => {
    githubCalls += 1;
    sendJson(res, 500, { error: "should not be called" });
  };
  const repo = "safe-project";
  const publishCapability = createPublishCapability(
    { userId, owner: "maker", repositoryName: repo },
    githubToken,
  );

  const response = await fetch(`${appOrigin}/api/github/upload-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "maker",
      repo,
      path: ".github/workflows/pwn.yml",
      content: "name: unexpected",
      publishCapability,
    }),
  });

  assert.equal(response.status, 400);
  assert.match(await response.text(), /not an allowed Makeable project artifact/i);
  assert.equal(githubCalls, 0);
});

function publishProject(repo, files) {
  const publishCapability = createPublishCapability(
    { userId, owner: "maker", repositoryName: repo },
    githubToken,
  );
  return fetch(`${appOrigin}/api/github/publish-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "maker",
      repo,
      files,
      message: "Publish tested Makeable project",
      publishCapability,
    }),
  });
}

async function readJson(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function availablePort() {
  const probe = createNetServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  probe.close();
  await once(probe, "close");
  return port;
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && appProcess.exitCode === null) {
    try {
      const response = await fetch(`${appOrigin}/api/health`);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(appStderr || "The Makeable test server did not start.");
}
