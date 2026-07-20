import assert from "node:assert/strict";
import test from "node:test";

import handler from "../netlify/functions/api.mjs";

const testOrigin = "https://test--makeable-build.netlify.app";
const backendOrigin = "https://api.makeable.test";

function installEnvironment(t, overrides = {}) {
  const previousNetlify = globalThis.Netlify;
  const previousFetch = globalThis.fetch;
  const values = {
    MAKEABLE_API_BASE_URL: backendOrigin,
    COGNITO_DOMAIN: "https://auth.makeable.test",
    COGNITO_CLIENT_ID: "client-id",
    COGNITO_REDIRECT_URI: `${testOrigin}/`,
    ...overrides,
  };
  globalThis.Netlify = {
    env: {
      get(key) {
        return values[key] || "";
      },
    },
  };
  t.after(() => {
    globalThis.Netlify = previousNetlify;
    globalThis.fetch = previousFetch;
  });
}

test("Netlify proxies protected API requests to the metered backend", async (t) => {
  installEnvironment(t);
  let upstream;
  globalThis.fetch = async (url, options) => {
    upstream = { url: String(url), options };
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  const response = await handler(
    new Request(`${testOrigin}/api/openai/responses`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
        "X-Makeable-Generation-Id": "generation-123",
      },
      body: JSON.stringify({ input: "test" }),
    }),
  );

  assert.equal(upstream.url, `${backendOrigin}/api/openai/responses`);
  assert.equal(upstream.options.headers.get("Authorization"), "Bearer test-token");
  assert.equal(upstream.options.headers.get("X-Makeable-Generation-Id"), "generation-123");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("branch config keeps its own Cognito callback while using backend capabilities", async (t) => {
  installEnvironment(t);
  globalThis.fetch = async (url) => {
    assert.equal(String(url), `${backendOrigin}/api/config`);
    return Response.json({
      hasAccounts: true,
      hasVoice: true,
      firmwareCompileSupported: true,
      cognitoRedirectUri: "https://makeable.build/",
      supportedBoards: [{ id: "esp32", label: "ESP32" }],
    });
  };

  const response = await handler(new Request(`${testOrigin}/api/config`));
  const config = await response.json();

  assert.equal(response.status, 200);
  assert.equal(config.apiBaseUrl, backendOrigin);
  assert.equal(config.cognitoRedirectUri, `${testOrigin}/`);
  assert.equal(config.hasAccounts, true);
  assert.equal(config.firmwareCompileSupported, true);
  assert.deepEqual(config.supportedBoards, [{ id: "esp32", label: "ESP32" }]);
});
