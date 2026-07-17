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
} from "../../src/makeable/server-contract.js";

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

    if (url.pathname === "/api/deepgram/token" && req.method === "POST") {
      return createDeepgramToken(env);
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

    if (url.pathname === "/api/arduino/status") {
      return jsonResponse({
        hasArduinoCli: false,
        hasEsp32Core: false,
        hostedMode: true,
        message:
          "Hosted guide mode is ready. Loading code onto a physical board still needs the local desktop server.",
      });
    }

    if (url.pathname === "/api/firmware/compile" && req.method === "POST") {
      return jsonResponse(
        {
          error:
            "This hosted version can make the guide and code, but board loading needs the local desktop app with Arduino installed.",
          hostedMode: true,
        },
        501,
      );
    }

    if (url.pathname === "/api/github/repos" && req.method === "POST") {
      return createGitHubRepo(req, env);
    }

    if (
      url.pathname === "/api/github/repository-recovery" &&
      req.method === "POST"
    ) {
      return recoverGitHubRepository(req, env);
    }

    if (url.pathname === "/api/github/upload-file" && req.method === "POST") {
      return uploadGitHubFile(req, env);
    }

    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        hostedMode: true,
        hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
        hasDeepgramKey: Boolean(env.DEEPGRAM_API_KEY),
        hasGithubToken: Boolean(env.GITHUB_TOKEN),
        firmwareCompileSupported: false,
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    const status =
      Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
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

function getEnv() {
  const keys = [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_REASONING_MODEL",
    "OPENAI_REASONING_EFFORT",
    "DEEPGRAM_API_KEY",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "ARDUINO_FQBN",
  ];
  return Object.fromEntries(keys.map((key) => [key, envValue(key)]));
}

function envValue(key) {
  return globalThis.Netlify?.env?.get(key) || process.env[key] || "";
}

function publicConfig(env) {
  return createPublicConfig(env, {
    hasArduinoCli: false,
    hostedMode: true,
    firmwareCompileSupported: false,
  });
}

function publicConfigScript(env) {
  return createPublicConfigScript(publicConfig(env));
}

async function createDeepgramToken(env) {
  const result = await grantDeepgramToken(env.DEEPGRAM_API_KEY);
  return jsonResponse(result.body, result.status, { "Cache-Control": "no-store" });
}

async function proxyOpenAI(req, env) {
  const missing = missingOpenAIKey(env);
  if (missing) return missing;

  const body = await req.json();
  if (!body.model) body.model = env.OPENAI_MODEL || "gpt-5.5";

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
    model: body.model || env.OPENAI_MODEL || "gpt-5.5",
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
  const body = await readLimitedJsonRequest(req, GITHUB_MAX_REQUEST_BYTES);
  const validation = validateGitHubRepositoryRequest(body, env.GITHUB_OWNER);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, validation.status);
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
  if (!upstream.ok) return pipeJson(upstream);
  const metadata = safeGitHubRepositoryMetadata(
    await upstream.json(),
    repository.owner,
    repository.name,
  );
  if (!metadata) {
    return jsonResponse(
      { error: "GitHub returned unverified repository metadata." },
      502,
    );
  }
  const issued = createPublishCapability(
    { owner: metadata.owner, repo: metadata.name },
    env.GITHUB_TOKEN,
  );
  return jsonResponse(
    {
      ...metadata,
      publishCapability: issued.capability,
      capabilityExpiresAt: issued.expiresAt,
    },
    201,
  );
}

async function recoverGitHubRepository(req, env) {
  if (!env.GITHUB_TOKEN) {
    return jsonResponse(
      { error: "GITHUB_TOKEN is missing in Netlify environment variables" },
      401,
    );
  }
  const body = await readLimitedJsonRequest(req, GITHUB_MAX_REQUEST_BYTES);
  const validation = validateGitHubRecoveryRequest(
    body,
    env.GITHUB_OWNER,
  );
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, validation.status);
  }
  const { owner, repo, recoverySecret } = validation.value;
  const upstream = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}`,
    { headers: githubHeaders(env) },
  );
  if (!upstream.ok) {
    return jsonResponse(
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
    return jsonResponse(
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
  return jsonResponse({
    ...metadata,
    publishCapability: issued.capability,
    capabilityExpiresAt: issued.expiresAt,
  });
}

async function uploadGitHubFile(req, env) {
  if (!env.GITHUB_TOKEN) {
    return jsonResponse({ error: "GITHUB_TOKEN is missing in Netlify environment variables" }, 401);
  }
  const body = await readLimitedJsonRequest(req, GITHUB_MAX_REQUEST_BYTES);
  const validation = validateGitHubUploadRequest(body, env.GITHUB_OWNER);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, validation.status);
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
    return jsonResponse({ error: authorization.error }, 403);
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
      return jsonResponse({ error: "GitHub returned invalid file metadata." }, 502);
    }
    sha = existingJson.sha;
  } else if (existing.status !== 404) {
    return pipeJson(existing);
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

async function readLimitedJsonRequest(req, maxBytes) {
  const advertisedLength = Number(req.headers.get("content-length"));
  if (
    Number.isFinite(advertisedLength) &&
    advertisedLength > maxBytes
  ) {
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
