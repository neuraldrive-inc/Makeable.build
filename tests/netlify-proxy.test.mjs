import assert from "node:assert/strict";
import test from "node:test";

import handler from "../netlify/functions/api.mjs";

const productionOrigin = "https://makeable.build";
const backendOrigin = "https://api.makeable.test";

function installEnvironment(t, overrides = {}) {
  const previousNetlify = globalThis.Netlify;
  const previousFetch = globalThis.fetch;
  const values = {
    MAKEABLE_API_BASE_URL: backendOrigin,
    COGNITO_DOMAIN: "https://auth.makeable.test",
    COGNITO_CLIENT_ID: "client-id",
    COGNITO_REDIRECT_URI: `${productionOrigin}/pilot`,
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
    new Request(`${productionOrigin}/api/openai/responses`, {
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

test("production config keeps the pilot callback while using backend capabilities", async (t) => {
  installEnvironment(t);
  globalThis.fetch = async (url) => {
    assert.equal(String(url), `${backendOrigin}/api/config`);
    return Response.json({
      hasAccounts: true,
      hasVoice: true,
      firmwareCompileSupported: true,
      cognitoRedirectUri: `${productionOrigin}/`,
      supportedBoards: [{ id: "esp32", label: "ESP32" }],
    });
  };

  const response = await handler(new Request(`${productionOrigin}/api/config`));
  const config = await response.json();

  assert.equal(response.status, 200);
  assert.equal(config.apiBaseUrl, backendOrigin);
  assert.equal(config.cognitoRedirectUri, `${productionOrigin}/pilot`);
  assert.equal(config.hasAccounts, true);
  assert.equal(config.firmwareCompileSupported, true);
  assert.deepEqual(config.supportedBoards, [{ id: "esp32", label: "ESP32" }]);
});

test("Netlify passes CORS preflights through without adding a body to 204 responses", async (t) => {
  installEnvironment(t);
  let upstream;
  globalThis.fetch = async (url, options) => {
    upstream = { url: String(url), options };
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": productionOrigin,
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Makeable-Generation-Id",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        Vary: "Origin",
      },
    });
  };

  const response = await handler(
    new Request(`${productionOrigin}/api/openai/responses`, {
      method: "OPTIONS",
      headers: {
        Origin: productionOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers":
          "authorization,content-type,x-makeable-generation-id",
      },
    }),
  );

  assert.equal(upstream.url, `${backendOrigin}/api/openai/responses`);
  assert.equal(upstream.options.headers.get("Origin"), productionOrigin);
  assert.equal(upstream.options.headers.get("Access-Control-Request-Method"), "POST");
  assert.equal(
    upstream.options.headers.get("Access-Control-Request-Headers"),
    "authorization,content-type,x-makeable-generation-id",
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), productionOrigin);
  assert.equal(await response.text(), "");
});
