import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("only a true loopback request can use the account-free local development APIs", async (t) => {
  const port = await availablePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "development",
      COGNITO_USER_POOL_ID: "",
      COGNITO_CLIENT_ID: "",
      CREDIT_ACCOUNTS_TABLE: "",
      CREDIT_LEDGER_TABLE: "",
      GITHUB_TOKEN: "",
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
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  });

  const deadline = Date.now() + 8_000;
  while (!stdout.includes("Makeable running at") && child.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(child.exitCode, null, stderr || "Local development server exited before becoming ready.");

  const request = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: `http://127.0.0.1:${port}`,
    },
    body: JSON.stringify({ name: "local-test", private: true }),
  };
  const localResponse = await fetch(`http://127.0.0.1:${port}/api/github/repos`, request);
  const localResult = await localResponse.json();
  assert.equal(localResponse.status, 401);
  assert.match(localResult.error, /GITHUB_TOKEN is missing/);

  const forgedHostResult = await postWithHost(port, "makeable.example", request.body);
  assert.equal(forgedHostResult.status, 401);
  assert.equal(forgedHostResult.body.error, "Sign in to continue.");

  const crossSiteResult = await postWithHost(port, `127.0.0.1:${port}`, request.body, {
    Origin: "https://malicious.example",
    "Content-Type": "text/plain",
    "Sec-Fetch-Site": "cross-site",
  });
  assert.equal(crossSiteResult.status, 401);
  assert.equal(crossSiteResult.body.error, "Sign in to continue.");

  const simpleRequestResult = await postWithHost(port, `127.0.0.1:${port}`, request.body, {
    Origin: `http://127.0.0.1:${port}`,
    "Content-Type": "text/plain",
  });
  assert.equal(simpleRequestResult.status, 401);
  assert.equal(simpleRequestResult.body.error, "Sign in to continue.");
});

async function availablePort() {
  const server = createNetServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
}

function postWithHost(port, host, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/github/repos",
        method: "POST",
        headers: {
          Host: host,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          resolve({ status: response.statusCode, body: JSON.parse(raw || "{}") });
        });
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}
