import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import netlifyHandler from "../../netlify/functions/api.mjs";
import { grantDeepgramToken } from "../../src/makeable/server-contract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function withDeepgramEnvironment(value, callback) {
  const previous = process.env.DEEPGRAM_API_KEY;
  if (value === undefined) delete process.env.DEEPGRAM_API_KEY;
  else process.env.DEEPGRAM_API_KEY = value;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = previous;
  }
}

test("public configuration exposes capability, never the Deepgram secret", async () => {
  await withDeepgramEnvironment("server-only-secret", async () => {
    const response = await netlifyHandler(new Request("https://makeable.test/api/config"));
    const config = await response.json();

    assert.equal(config.hasDeepgramKey, true);
    assert.equal("deepgramApiKey" in config, false);
    assert.doesNotMatch(JSON.stringify(config), /server-only-secret/);
  });
});

test("the public config script defines MAKEABLE_CONFIG and only aliases the legacy global", async () => {
  await withDeepgramEnvironment("server-only-secret", async () => {
    const response = await netlifyHandler(new Request("https://makeable.test/config.local.js"));
    const script = await response.text();

    assert.match(script, /window\.MAKEABLE_CONFIG\s*=/);
    assert.match(
      script,
      /window\.CIRCUIT_CODEX_CONFIG\s*=\s*window\.MAKEABLE_CONFIG/,
    );
    assert.doesNotMatch(script, /server-only-secret|deepgramApiKey/);
  });
});

test("the Netlify token endpoint grants a short-lived token and returns only safe fields", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify({
        access_token: "temporary-token",
        expires_in: 60,
        api_key: "must-not-pass-through",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await withDeepgramEnvironment("server-only-secret", async () => {
      const response = await netlifyHandler(
        new Request("https://makeable.test/api/deepgram/token", { method: "POST" }),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), {
        access_token: "temporary-token",
        expires_in: 60,
      });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.deepgram.com/v1/auth/grant");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, "Token server-only-secret");
  const body = JSON.parse(calls[0].options.body);
  assert.ok(body.time_to_live_in_seconds > 0);
  assert.ok(body.time_to_live_in_seconds <= 60);
});

test("Deepgram failures return a safe error without leaking secrets or upstream bodies", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("upstream detail that must stay private", { status: 403 });

  try {
    await withDeepgramEnvironment("server-only-secret", async () => {
      const response = await netlifyHandler(
        new Request("https://makeable.test/api/deepgram/token", { method: "POST" }),
      );
      assert.equal(response.status, 502);
      const text = await response.text();
      assert.match(text, /Unable to create a speech token/);
      assert.doesNotMatch(text, /server-only-secret|upstream detail/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Deepgram rejects non-positive, fractional, and overlong token expiries", async () => {
  for (const expiresIn of [-1, 0, 1.5, 61]) {
    const result = await grantDeepgramToken(
      "server-only-secret",
      async () =>
        new Response(
          JSON.stringify({
            access_token: "temporary-token",
            expires_in: expiresIn,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    assert.deepEqual(
      result,
      {
        status: 502,
        body: { error: "Unable to create a speech token" },
      },
      `expires_in=${expiresIn} should be rejected`,
    );
  }
});

test("local and Netlify entrypoints wire the secure token endpoint and /build SPA fallback", async () => {
  const [serverSource, netlifySource, netlifyConfig, html] = await Promise.all([
    readFile(path.join(root, "server.mjs"), "utf8"),
    readFile(path.join(root, "netlify/functions/api.mjs"), "utf8"),
    readFile(path.join(root, "netlify.toml"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8"),
  ]);

  assert.match(serverSource, /\/api\/deepgram\/token/);
  assert.match(netlifySource, /\/api\/deepgram\/token/);
  assert.match(serverSource, /pathname\.startsWith\(["']\/build\/["']\)/);
  assert.match(netlifyConfig, /from\s*=\s*"\/build\/\*"/);
  assert.match(netlifyConfig, /to\s*=\s*"\/index\.html"/);
  assert.match(html, /<base href="\/"\s*\/?>/);
  assert.match(html, /src="\.\/config\.local\.js"/);
});

test("the local server reads file-backed environment values once instead of per request", async () => {
  const serverSource = await readFile(path.join(root, "server.mjs"), "utf8");

  assert.match(serverSource, /const fileEnv\s*=\s*readEnv\(/);
  assert.match(
    serverSource,
    /function getEnv\(\)\s*{\s*return\s*{\s*\.\.\.fileEnv,\s*\.\.\.process\.env\s*};\s*}/,
  );
  const getEnvSource = serverSource.match(/function getEnv\(\)\s*{[\s\S]*?\n}/)?.[0] || "";
  assert.doesNotMatch(getEnvSource, /readEnv\(/);
});

test("Playwright owns the server process directly and the server closes on termination", async () => {
  const [serverSource, playwrightSource] = await Promise.all([
    readFile(path.join(root, "server.mjs"), "utf8"),
    readFile(path.join(root, "playwright.config.js"), "utf8"),
  ]);

  assert.match(playwrightSource, /command:\s*"node server\.mjs"/);
  assert.match(serverSource, /process\.once\("SIGTERM",\s*shutdown\)/);
  assert.match(serverSource, /process\.once\("SIGINT",\s*shutdown\)/);
  assert.match(serverSource, /server\.close\(/);
});
