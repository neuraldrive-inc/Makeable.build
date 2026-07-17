export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const env = getEnv();

    if (url.pathname === "/config.local.js") {
      return textResponse(publicConfigScript(env), "text/javascript; charset=utf-8");
    }

    if (url.pathname === "/api/config") {
      return jsonResponse(publicConfig(env));
    }

    if (url.pathname === "/api/openai/responses" && req.method === "POST") {
      return proxyOpenAI(req, env);
    }

    if (url.pathname === "/api/openai/background" && req.method === "POST") {
      return createOpenAIBackgroundResponse(req, env);
    }

    const responseMatch = url.pathname.match(/^\/api\/openai\/responses\/([^/]+)$/);
    if (responseMatch && req.method === "GET") {
      return retrieveOpenAIResponse(responseMatch[1], env);
    }

    if (url.pathname === "/api/esp32/status") {
      return proxyMakeableApi(req, env);
    }

    if (url.pathname === "/api/firmware/compile" && req.method === "POST") {
      return proxyMakeableApi(req, env);
    }

    if (url.pathname === "/api/deepgram/token" && req.method === "POST") {
      return proxyMakeableApi(req, env);
    }

    if (url.pathname === "/api/github/repos" && req.method === "POST") {
      return createGitHubRepo(req, env);
    }

    if (url.pathname === "/api/github/upload-file" && req.method === "POST") {
      return uploadGitHubFile(req, env);
    }

    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        hostedMode: true,
        hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
        hasGithubToken: Boolean(env.GITHUB_TOKEN),
        firmwareCompileSupported: Boolean(env.MAKEABLE_API_BASE_URL),
      });
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

function getEnv() {
  const keys = [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_REASONING_MODEL",
    "OPENAI_REASONING_EFFORT",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "MAKEABLE_API_BASE_URL",
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
    openaiModel: env.OPENAI_MODEL || "gpt-5.6-sol",
    openaiReasoningModel: env.OPENAI_REASONING_MODEL || "gpt-5.6-sol",
    openaiReasoningEffort: env.OPENAI_REASONING_EFFORT || "high",
    hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
    hasGithubToken: Boolean(env.GITHUB_TOKEN),
    hasEsp32Compiler: false,
    hostedMode: true,
    firmwareCompileSupported: Boolean(env.MAKEABLE_API_BASE_URL),
  };
}

async function proxyMakeableApi(req, env) {
  const base = String(env.MAKEABLE_API_BASE_URL || "").replace(/\/$/, "");
  if (!base) return jsonResponse({ error: "The hosted firmware service is not configured." }, 503);
  const inputUrl = new URL(req.url);
  const upstream = await fetch(`${base}${inputUrl.pathname}${inputUrl.search}`, {
    method: req.method,
    headers: { "Content-Type": req.headers.get("content-type") || "application/json" },
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
  body.model = env.OPENAI_MODEL || "gpt-5.6-sol";

  return streamJsonUpstream(
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: openAIHeaders(env),
      body: JSON.stringify(body),
    }),
  );
}

async function createOpenAIBackgroundResponse(req, env) {
  const missing = missingOpenAIKey(env);
  if (missing) return missing;

  const body = await req.json();
  const payload = {
    ...body,
    model: env.OPENAI_REASONING_MODEL || env.OPENAI_MODEL || "gpt-5.6-sol",
    background: true,
    store: body.store ?? true,
  };
  delete payload.stream;

  return streamJsonUpstream(
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: openAIHeaders(env),
      body: JSON.stringify(payload),
    }),
  );
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
