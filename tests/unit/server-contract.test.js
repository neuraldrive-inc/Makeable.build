import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import netlifyHandler from "../../netlify/functions/api.mjs";
import {
  createGitHubRepositoryDescription,
  createPublishCapability,
  GITHUB_ARTIFACT_PATHS,
  GITHUB_MAX_CONTENT_BYTES,
  grantDeepgramToken,
  safeGitHubRepositoryMetadata,
  verifyPublishCapability,
  validateGitHubUploadRequest,
} from "../../src/makeable/server-contract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RECOVERY_SECRET = "ab".repeat(32);

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

async function withGitHubEnvironment({ token = "server-token", owner = "ray-builds" }, callback) {
  const previous = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_OWNER: process.env.GITHUB_OWNER,
  };
  process.env.GITHUB_TOKEN = token;
  process.env.GITHUB_OWNER = owner;
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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
  assert.ok(body.ttl_seconds > 0);
  assert.ok(body.ttl_seconds <= 60);
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

test("the local server reads file-backed provider values once and lets them override inherited values", async () => {
  const serverSource = await readFile(path.join(root, "server.mjs"), "utf8");

  assert.match(serverSource, /const fileEnv\s*=\s*readEnv\(/);
  assert.match(
    serverSource,
    /const localConfigKeys\s*=\s*new Set\([\s\S]*?"OPENAI_API_KEY"/,
  );
  assert.match(serverSource, /if \(localConfigKeys\.has\(key\) \|\| env\[key\] === undefined\) env\[key\] = value;/);
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

test("the GitHub upload boundary accepts only configured-owner Makeable artifacts", () => {
  for (const artifactPath of GITHUB_ARTIFACT_PATHS) {
    const result = validateGitHubUploadRequest(
      {
        owner: "ray-builds",
        repo: "self-watering-plant",
        path: artifactPath,
        content: "safe content",
        message: "ignored client message",
        capability: "opaque-capability",
      },
      "ray-builds",
    );
    assert.equal(result.ok, true, artifactPath);
    assert.equal(result.value.owner, "ray-builds");
    assert.equal(result.value.repo, "self-watering-plant");
    assert.equal(result.value.path, artifactPath);
    assert.equal("branch" in result.value, false);
  }

  for (const body of [
    {
      owner: "someone-else",
      repo: "self-watering-plant",
      path: "README.md",
      content: "attack",
    },
    {
      owner: "ray-builds",
      repo: "../victim",
      path: "README.md",
      content: "attack",
    },
    {
      owner: "ray-builds",
      repo: "self-watering-plant",
      path: ".github/workflows/pwn.yml",
      content: "attack",
    },
    {
      owner: "ray-builds",
      repo: "self-watering-plant",
      path: "README.md",
      content: "attack",
      branch: "main",
    },
    {
      owner: "ray-builds",
      repo: "self-watering-plant",
      path: "README.md",
      content: "x".repeat(GITHUB_MAX_CONTENT_BYTES + 1),
    },
    {
      owner: "ray-builds",
      repo: "self-watering-plant",
      path: "README.md",
      content: { unsafe: true },
    },
  ]) {
    assert.equal(
      validateGitHubUploadRequest(body, "ray-builds").ok,
      false,
      JSON.stringify({ ...body, content: typeof body.content }),
    );
  }
  assert.equal(
    validateGitHubUploadRequest(
      {
        owner: "ray-builds",
        repo: "self-watering-plant",
        path: "README.md",
        content: "safe",
      },
      "",
    ).ok,
    false,
  );
});

test("Netlify upload performs server-owned SHA GET/PUT and never accepts client branch", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === "PUT") {
      return new Response(JSON.stringify({ content: { sha: "new-sha" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ sha: "existing-sha" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await withGitHubEnvironment({}, async () => {
      const capability = createPublishCapability(
        {
          owner: "ray-builds",
          repo: "self-watering-plant",
        },
        "server-token",
      ).capability;
      const response = await netlifyHandler(
        new Request("https://makeable.test/api/github/upload-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: "ray-builds",
            repo: "self-watering-plant",
            path: "README.md",
            content: "Makeable",
            capability,
          }),
        }),
      );
      assert.equal(response.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  assert.match(
    calls[0].url,
    /repos\/ray-builds\/self-watering-plant\/contents\/README\.md$/,
  );
  assert.doesNotMatch(calls[0].url, /[?&]ref=/);
  assert.equal(calls[1].options.method, "PUT");
  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.sha, "existing-sha");
  assert.equal(Buffer.from(payload.content, "base64").toString("utf8"), "Makeable");
  assert.equal("branch" in payload, false);
});

test("Netlify rejects cross-owner, arbitrary-path, branch, and oversized uploads before GitHub", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unexpected", { status: 500 });
  };
  try {
    await withGitHubEnvironment({}, async () => {
      for (const body of [
        {
          owner: "victim",
          repo: "self-watering-plant",
          path: "README.md",
          content: "attack",
        },
        {
          owner: "ray-builds",
          repo: "self-watering-plant",
          path: ".github/workflows/pwn.yml",
          content: "attack",
        },
        {
          owner: "ray-builds",
          repo: "self-watering-plant",
          path: "README.md",
          content: "attack",
          branch: "main",
        },
        {
          owner: "ray-builds",
          repo: "self-watering-plant",
          path: "README.md",
          content: "x".repeat(GITHUB_MAX_CONTENT_BYTES + 1),
        },
      ]) {
        const response = await netlifyHandler(
          new Request("https://makeable.test/api/github/upload-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        assert.equal(response.status, 400);
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 0);
});

test("a recovery secret verifies a Makeable-owned repository and mints a capability", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        name: "self-watering-plant",
        html_url: "https://github.com/ray-builds/self-watering-plant",
        private: true,
        owner: { login: "ray-builds" },
        description: createGitHubRepositoryDescription(
          "Self-watering plant",
          RECOVERY_SECRET,
        ),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  try {
    await withGitHubEnvironment({}, async () => {
      const response = await netlifyHandler(
        new Request("https://makeable.test/api/github/repository-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: "self-watering-plant",
            recoverySecret: RECOVERY_SECRET,
          }),
        }),
      );
      assert.equal(response.status, 200);
      const recovered = await response.json();
      assert.deepEqual(
        {
          owner: recovered.owner,
          name: recovered.name,
          html_url: recovered.html_url,
          private: recovered.private,
        },
        {
          owner: "ray-builds",
          name: "self-watering-plant",
          html_url: "https://github.com/ray-builds/self-watering-plant",
          private: true,
        },
      );
      assert.equal(
        verifyPublishCapability(
          recovered.publishCapability,
          {
            owner: "ray-builds",
            repo: "self-watering-plant",
            path: "README.md",
          },
          "server-token",
        ).ok,
        true,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publish capabilities reject tampering, expiry, the wrong repo, and the wrong path", () => {
  const issued = createPublishCapability(
    { owner: "ray-builds", repo: "self-watering-plant" },
    "server-token",
    { now: 1_000_000 },
  );
  const request = {
    owner: "ray-builds",
    repo: "self-watering-plant",
    path: "README.md",
  };
  assert.equal(
    verifyPublishCapability(issued.capability, request, "server-token", {
      now: 1_001_000,
    }).ok,
    true,
  );
  assert.equal(
    verifyPublishCapability(
      `${issued.capability.slice(0, -1)}x`,
      request,
      "server-token",
      { now: 1_001_000 },
    ).ok,
    false,
  );
  assert.equal(
    verifyPublishCapability(
      issued.capability,
      { ...request, repo: "another-repo" },
      "server-token",
      { now: 1_001_000 },
    ).ok,
    false,
  );
  assert.equal(
    verifyPublishCapability(
      issued.capability,
      { ...request, path: ".github/workflows/pwn.yml" },
      "server-token",
      { now: 1_001_000 },
    ).ok,
    false,
  );
  assert.equal(
    verifyPublishCapability(issued.capability, request, "server-token", {
      now: issued.expiresAt + 1,
    }).ok,
    false,
  );
});

test("wrong or missing recovery secrets never mint a capability and no public GET recovery exists", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        name: "self-watering-plant",
        private: false,
        owner: { login: "ray-builds" },
        description: createGitHubRepositoryDescription(
          "Self-watering plant",
          RECOVERY_SECRET,
        ),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    await withGitHubEnvironment({}, async () => {
      for (const body of [
        { repo: "self-watering-plant" },
        {
          repo: "self-watering-plant",
          recoverySecret: "cd".repeat(32),
        },
      ]) {
        const response = await netlifyHandler(
          new Request("https://makeable.test/api/github/repository-recovery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        assert.ok([400, 403].includes(response.status));
        assert.equal("publishCapability" in (await response.json()), false);
      }
      const getResponse = await netlifyHandler(
        new Request(
          "https://makeable.test/api/github/repository-recovery?repo=self-watering-plant",
        ),
      );
      assert.equal(getResponse.status, 404);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 1);
});

test("upload rejects missing, tampered, wrong-repo, and wrong-path capabilities before GitHub", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unexpected", { status: 500 });
  };
  const issued = createPublishCapability(
    { owner: "ray-builds", repo: "self-watering-plant" },
    "server-token",
  ).capability;
  try {
    await withGitHubEnvironment({}, async () => {
      for (const body of [
        {
          owner: "ray-builds",
          repo: "self-watering-plant",
          path: "README.md",
          content: "Makeable",
        },
        {
          owner: "ray-builds",
          repo: "self-watering-plant",
          path: "README.md",
          content: "Makeable",
          capability: `${issued.slice(0, -1)}x`,
        },
        {
          owner: "ray-builds",
          repo: "another-repo",
          path: "README.md",
          content: "Makeable",
          capability: issued,
        },
        {
          owner: "ray-builds",
          repo: "self-watering-plant",
          path: "parts-list/README.md",
          content: "Makeable",
          capability: createPublishCapability(
            { owner: "ray-builds", repo: "another-repo" },
            "server-token",
          ).capability,
        },
      ]) {
        const response = await netlifyHandler(
          new Request("https://makeable.test/api/github/upload-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        assert.ok([400, 403].includes(response.status));
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 0);
});

test("repository metadata from a different owner or visibility-less response is rejected", () => {
  assert.equal(
    safeGitHubRepositoryMetadata(
      {
        name: "self-watering-plant",
        private: false,
        owner: { login: "someone-else" },
      },
      "ray-builds",
      "self-watering-plant",
    ),
    null,
  );
  assert.equal(
    safeGitHubRepositoryMetadata(
      {
        name: "self-watering-plant",
        owner: { login: "ray-builds" },
      },
      "ray-builds",
      "self-watering-plant",
    ),
    null,
  );
});

test("repository creation stores only a recovery proof and returns a short-lived capability", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamBody;
  globalThis.fetch = async (_url, options) => {
    upstreamBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        name: "self-watering-plant",
        private: false,
        owner: { login: "ray-builds" },
        description: upstreamBody.description,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    await withGitHubEnvironment({}, async () => {
      const response = await netlifyHandler(
        new Request("https://makeable.test/api/github/repos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "self-watering-plant",
            description: "Self-watering plant",
            private: false,
            recoverySecret: RECOVERY_SECRET,
          }),
        }),
      );
      assert.equal(response.status, 201);
      const created = await response.json();
      assert.equal(
        verifyPublishCapability(
          created.publishCapability,
          {
            owner: "ray-builds",
            repo: "self-watering-plant",
            path: "code/makeable.ino",
          },
          "server-token",
        ).ok,
        true,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal("recoverySecret" in upstreamBody, false);
  assert.doesNotMatch(upstreamBody.description, new RegExp(RECOVERY_SECRET));
  assert.match(upstreamBody.description, /\[makeable:v1:[a-f0-9]{64}\]/);
});

test("local and Netlify GitHub endpoints use the same capability and recovery helpers", async () => {
  const [serverSource, netlifySource] = await Promise.all([
    readFile(path.join(root, "server.mjs"), "utf8"),
    readFile(path.join(root, "netlify/functions/api.mjs"), "utf8"),
  ]);
  for (const source of [serverSource, netlifySource]) {
    assert.match(source, /repository-recovery/);
    assert.match(source, /createPublishCapability/);
    assert.match(source, /repositoryMatchesRecoverySecret/);
    assert.match(source, /verifyPublishCapability/);
    assert.doesNotMatch(source, /api\/github\/repository["'][\s\S]{0,80}GET/);
  }
});
