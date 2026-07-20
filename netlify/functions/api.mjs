export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const env = getEnv();

    if (url.pathname === "/config.local.js") {
      return textResponse(publicConfigScript(env), "text/javascript; charset=utf-8");
    }

    if (url.pathname === "/api/config") {
      return jsonResponse(await resolvedPublicConfig(env));
    }

    if (url.pathname.startsWith("/api/")) {
      return proxyMakeableApi(req, env);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: String(error.message || error) }, 500);
  }
}

export const config = {
  path: ["/config.local.js", "/api/*"],
};

const DEFAULT_OPENAI_MODEL = "gpt-5.6-terra";
const DEFAULT_OPENAI_REASONING_EFFORT = "low";
const DEFAULT_OPENAI_SERVICE_TIER = "priority";

function getEnv() {
  const keys = [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_REASONING_MODEL",
    "OPENAI_REASONING_EFFORT",
    "OPENAI_SERVICE_TIER",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "MAKEABLE_API_BASE_URL",
    "COGNITO_DOMAIN",
    "COGNITO_CLIENT_ID",
    "COGNITO_REDIRECT_URI",
  ];
  return Object.fromEntries(keys.map((key) => [key, envValue(key)]));
}

function envValue(key) {
  return globalThis.Netlify?.env?.get(key) || process.env[key] || "";
}

function publicConfig(env) {
  return {
    apiBaseUrl: String(env.MAKEABLE_API_BASE_URL || "").replace(/\/$/, ""),
    githubOwner: env.GITHUB_OWNER || "",
    openaiModel: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    openaiReasoningModel: env.OPENAI_REASONING_MODEL || DEFAULT_OPENAI_MODEL,
    openaiReasoningEffort: env.OPENAI_REASONING_EFFORT || DEFAULT_OPENAI_REASONING_EFFORT,
    openaiServiceTier: openAIServiceTier(env),
    hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
    hasGithubToken: Boolean(env.GITHUB_TOKEN),
    hasVoice: Boolean(env.MAKEABLE_API_BASE_URL),
    hasAccounts: Boolean(env.COGNITO_DOMAIN && env.COGNITO_CLIENT_ID),
    cognitoDomain: env.COGNITO_DOMAIN || "",
    cognitoClientId: env.COGNITO_CLIENT_ID || "",
    cognitoRedirectUri: env.COGNITO_REDIRECT_URI || "",
    hasEsp32Compiler: false,
    hostedMode: true,
    firmwareCompileSupported: Boolean(env.MAKEABLE_API_BASE_URL),
  };
}

async function resolvedPublicConfig(env) {
  const local = publicConfig(env);
  if (!local.apiBaseUrl) return local;
  try {
    const response = await fetch(`${local.apiBaseUrl}/api/config`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return local;
    const backend = await response.json();
    return {
      ...local,
      ...backend,
      apiBaseUrl: local.apiBaseUrl,
      cognitoRedirectUri: local.cognitoRedirectUri || backend.cognitoRedirectUri || "",
    };
  } catch {
    return local;
  }
}

async function proxyMakeableApi(req, env) {
  const base = String(env.MAKEABLE_API_BASE_URL || "").replace(/\/$/, "");
  if (!base) return jsonResponse({ error: "The hosted firmware service is not configured." }, 503);
  const inputUrl = new URL(req.url);
  const headers = new Headers({
    "Content-Type": req.headers.get("content-type") || "application/json",
  });
  const authorization = req.headers.get("authorization");
  const generationId = req.headers.get("x-makeable-generation-id");
  if (authorization) headers.set("Authorization", authorization);
  if (generationId) headers.set("X-Makeable-Generation-Id", generationId);
  const upstream = await fetch(`${base}${inputUrl.pathname}${inputUrl.search}`, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
  });
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}

function publicConfigScript(env) {
  return `window.MAKEABLE_CONFIG = ${JSON.stringify(publicConfig(env))};`;
}

async function proxyOpenAI(req, env) {
  const missing = missingOpenAIKey(env);
  if (missing) return missing;

  const body = await req.json();
  body.model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  body.service_tier = openAIServiceTier(env);

  return streamJsonUpstream(requestOpenAIResponse(body, env));
}

async function createOpenAIBackgroundResponse(req, env) {
  const missing = missingOpenAIKey(env);
  if (missing) return missing;

  const body = await req.json();
  const payload = {
    ...body,
    model: env.OPENAI_REASONING_MODEL || env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    service_tier: openAIServiceTier(env),
    background: true,
    store: body.store ?? true,
  };
  delete payload.stream;

  return streamJsonUpstream(requestOpenAIResponse(payload, env));
}

function openAIServiceTier(env) {
  const tier = String(env.OPENAI_SERVICE_TIER || DEFAULT_OPENAI_SERVICE_TIER).toLowerCase();
  return ["auto", "default", "flex", "priority"].includes(tier)
    ? tier
    : DEFAULT_OPENAI_SERVICE_TIER;
}

async function requestOpenAIResponse(payload, env) {
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: openAIHeaders(env),
    body: JSON.stringify(payload),
  });
  if (openAIServiceTier(env) !== "priority" || upstream.ok) return upstream;

  const failure = await upstream.clone().text();
  if (!/service[_\s-]*tier|priority.*(?:unavailable|not enabled|not supported)/i.test(failure)) {
    return upstream;
  }

  console.warn("OpenAI priority tier is unavailable; retrying this request on the standard tier.");
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: openAIHeaders(env),
    body: JSON.stringify({ ...payload, service_tier: "default" }),
  });
}

async function retrieveOpenAIResponse(responseId, env) {
  const missing = missingOpenAIKey(env);
  if (missing) return missing;

  const id = encodeURIComponent(decodeURIComponent(responseId));
  const upstream = await fetch(`https://api.openai.com/v1/responses/${id}`, {
    headers: openAIHeaders(env),
  });
  return pipeJson(upstream);
}

function missingOpenAIKey(env) {
  if (env.OPENAI_API_KEY) return null;
  return jsonResponse({ error: "OPENAI_API_KEY is missing in Netlify environment variables" }, 401);
}

function openAIHeaders(env) {
  return {
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function streamJsonUpstream(upstreamPromise) {
  const encoder = new TextEncoder();
  let keepAlive;

  return new Response(
    new ReadableStream({
      start(controller) {
        const send = (text) => controller.enqueue(encoder.encode(text));
        send(" \n");
        keepAlive = setInterval(() => send(" \n"), 8000);

        upstreamPromise
          .then(async (upstream) => {
            const text = await upstream.text();
            clearInterval(keepAlive);
            send(upstream.ok ? text || "{}" : upstreamErrorJson(upstream.status, text));
          })
          .catch((error) => {
            clearInterval(keepAlive);
            send(JSON.stringify({ error: String(error.message || error), upstreamStatus: 502 }));
          })
          .finally(() => controller.close());
      },
      cancel() {
        clearInterval(keepAlive);
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

function upstreamErrorJson(status, text) {
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { message: text };
  }
  const message = parsed.error?.message || parsed.message || parsed.error || `OpenAI returned HTTP ${status}`;
  return JSON.stringify({ error: message, upstreamStatus: status });
}

async function pipeJson(upstream) {
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    },
  });
}

function jsonResponse(data, status = 200) {
  return textResponse(JSON.stringify(data), "application/json; charset=utf-8", status);
}

function textResponse(text, contentType, status = 200) {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": contentType,
    },
  });
}
