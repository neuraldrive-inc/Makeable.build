import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { OAuth2Client } from "google-auth-library";
import {
  createEmailWaitlistRecord,
  createGoogleWaitlistResult,
} from "../../lib/acquisition.mjs";

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

    if (url.pathname === "/api/waitlist" && req.method === "POST") {
      return await createWaitlistSignup(req, env);
    }

    if (url.pathname === "/api/auth/google" && req.method === "POST") {
      return await completeGoogleWaitlist(req, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return await proxyMakeableApi(req, env);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    const status =
      Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    if (status === 500) console.error(error);
    return jsonResponse(
      {
        error:
          status === 500
            ? "The Makeable server could not complete the request."
            : String(error.message || error),
      },
      status,
    );
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
    "GOOGLE_CLIENT_ID",
    "WAITLIST_WEBHOOK_URL",
    "WAITLIST_WEBHOOK_SECRET",
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
    googleClientId: env.GOOGLE_CLIENT_ID || "",
    hasGoogleSignIn: Boolean(env.GOOGLE_CLIENT_ID),
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
      googleClientId: local.googleClientId,
      hasGoogleSignIn: local.hasGoogleSignIn,
    };
  } catch {
    return local;
  }
}

async function createWaitlistSignup(req, env) {
  const validation = createEmailWaitlistRecord(
    await readLimitedJsonRequest(req, 16 * 1024),
  );
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, validation.status, {
      "Cache-Control": "no-store",
    });
  }
  const delivery = await deliverWaitlistRecord(validation.value, env);
  if (!delivery.ok) {
    return jsonResponse({ error: delivery.error }, delivery.status, {
      "Cache-Control": "no-store",
    });
  }
  return jsonResponse({ ok: true }, 200, { "Cache-Control": "no-store" });
}

async function completeGoogleWaitlist(req, env) {
  if (!env.GOOGLE_CLIENT_ID) {
    return jsonResponse({ error: "Google sign-in is not configured." }, 503, {
      "Cache-Control": "no-store",
    });
  }
  const body = await readLimitedJsonRequest(req, 20 * 1024);
  if (
    typeof body.credential !== "string" ||
    !body.credential ||
    body.credential.length > 16_384 ||
    typeof body.intent !== "string" ||
    Object.keys(body).some((key) => !["credential", "intent"].includes(key))
  ) {
    return jsonResponse({ error: "Google sign-in request is invalid." }, 400, {
      "Cache-Control": "no-store",
    });
  }

  let identity;
  try {
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: body.credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    identity = ticket.getPayload();
  } catch {
    return jsonResponse({ error: "Google could not verify this sign-in." }, 401, {
      "Cache-Control": "no-store",
    });
  }

  const result = createGoogleWaitlistResult(identity, body.intent);
  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status, {
      "Cache-Control": "no-store",
    });
  }
  const delivery = await deliverWaitlistRecord(result.value.record, env);
  if (!delivery.ok) {
    return jsonResponse({ error: delivery.error }, delivery.status, {
      "Cache-Control": "no-store",
    });
  }
  return jsonResponse({ ok: true, user: result.value.user }, 200, {
    "Cache-Control": "no-store",
  });
}

async function deliverWaitlistRecord(record, env) {
  if (env.WAITLIST_WEBHOOK_URL) {
    return deliverWaitlistWebhook(record, env);
  }
  try {
    const key = `signup-${createHash("sha256").update(record.email).digest("hex")}`;
    await getStore("waitlist").setJSON(key, record);
    return { ok: true };
  } catch (error) {
    console.error("Waitlist storage failed", error);
    return {
      ok: false,
      status: 502,
      error: "Waitlist signup could not be saved. Please try again.",
    };
  }
}

async function deliverWaitlistWebhook(record, env) {
  let url;
  try {
    url = new URL(env.WAITLIST_WEBHOOK_URL);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Waitlist storage is not configured for this deployment.",
    };
  }
  try {
    const headers = { "Content-Type": "application/json" };
    if (env.WAITLIST_WEBHOOK_SECRET) {
      headers.Authorization = `Bearer ${env.WAITLIST_WEBHOOK_SECRET}`;
    }
    const upstream = await fetch(url.href, {
      method: "POST",
      headers,
      body: JSON.stringify(record),
    });
    if (!upstream.ok) throw new Error("Waitlist upstream rejected the record");
    return { ok: true };
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Waitlist signup could not be saved. Please try again.",
    };
  }
}

async function readLimitedJsonRequest(req, maxBytes) {
  const advertisedLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    throw requestError("Request body is too large.", 413);
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw requestError("Request body is too large.", 413);
  }
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

async function proxyMakeableApi(req, env) {
  const base = String(env.MAKEABLE_API_BASE_URL || "").replace(/\/$/, "");
  if (!base) return jsonResponse({ error: "The hosted firmware service is not configured." }, 503);
  const inputUrl = new URL(req.url);
  const headers = new Headers({
    "Content-Type": req.headers.get("content-type") || "application/json",
  });
  const authorization = req.headers.get("authorization");
  const generationId = req.headers.get("x-makeable-generation-id");
  const origin = req.headers.get("origin");
  const requestedMethod = req.headers.get("access-control-request-method");
  const requestedHeaders = req.headers.get("access-control-request-headers");
  if (authorization) headers.set("Authorization", authorization);
  if (generationId) headers.set("X-Makeable-Generation-Id", generationId);
  if (origin) headers.set("Origin", origin);
  if (requestedMethod) headers.set("Access-Control-Request-Method", requestedMethod);
  if (requestedHeaders) headers.set("Access-Control-Request-Headers", requestedHeaders);
  const upstream = await fetch(`${base}${inputUrl.pathname}${inputUrl.search}`, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
  });
  const responseHeaders = new Headers();
  for (const name of [
    "content-type",
    "cache-control",
    "access-control-allow-origin",
    "access-control-allow-headers",
    "access-control-allow-methods",
    "vary",
    "www-authenticate",
  ]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const responseHasNoBody =
    req.method === "HEAD" || [204, 205, 304].includes(upstream.status);
  return new Response(responseHasNoBody ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
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

async function createGitHubRepo(req, env) {
  if (!env.GITHUB_TOKEN) {
    return jsonResponse({ error: "GITHUB_TOKEN is missing in Netlify environment variables" }, 401);
  }
  const body = await req.json();
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
  return pipeJson(upstream);
}

async function uploadGitHubFile(req, env) {
  if (!env.GITHUB_TOKEN) {
    return jsonResponse({ error: "GITHUB_TOKEN is missing in Netlify environment variables" }, 401);
  }
  const body = await req.json();
  const owner = body.owner || env.GITHUB_OWNER;
  const repo = body.repo;
  const filePath = body.path;
  if (!owner || !repo || !filePath) {
    return jsonResponse({ error: "owner, repo, and path are required" }, 400);
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
    return pipeJson(existing);
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
  return pipeJson(upstream);
}

function githubHeaders(env) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function pipeJson(upstream) {
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    },
  });
}

function jsonResponse(data, status = 200, headers = {}) {
  return textResponse(
    JSON.stringify(data),
    "application/json; charset=utf-8",
    status,
    headers,
  );
}

function textResponse(text, contentType, status = 200, headers = {}) {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": contentType,
      ...headers,
    },
  });
}
