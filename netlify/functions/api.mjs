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

    if (url.pathname === "/api/github/upload-file" && req.method === "POST") {
      return uploadGitHubFile(req, env);
    }

    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        hostedMode: true,
        hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
        hasGithubToken: Boolean(env.GITHUB_TOKEN),
        firmwareCompileSupported: false,
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
    "DEEPGRAM_BROWSER_KEY",
    "DEEPGRAM_API_KEY",
    "ALLOW_BROWSER_DEEPGRAM_KEY",
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
  const allowDeepgramSecret =
    String(env.ALLOW_BROWSER_DEEPGRAM_KEY || "").toLowerCase() === "true";
  return {
    deepgramApiKey: env.DEEPGRAM_BROWSER_KEY || (allowDeepgramSecret ? env.DEEPGRAM_API_KEY : ""),
    githubOwner: env.GITHUB_OWNER || "",
    openaiModel: env.OPENAI_MODEL || "gpt-5.5",
    openaiReasoningModel: env.OPENAI_REASONING_MODEL || "gpt-5.5",
    openaiReasoningEffort: env.OPENAI_REASONING_EFFORT || "high",
    arduinoFqbn: env.ARDUINO_FQBN || "esp32:esp32:esp32",
    hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
    hasGithubToken: Boolean(env.GITHUB_TOKEN),
    hasArduinoCli: false,
    hostedMode: true,
    firmwareCompileSupported: false,
  };
}

function publicConfigScript(env) {
  return `window.CIRCUIT_CODEX_CONFIG = ${JSON.stringify(publicConfig(env))};`;
}

async function proxyOpenAI(req, env) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: "OPENAI_API_KEY is missing in Netlify environment variables" }, 401);
  }

  const body = await req.json();
  if (!body.model) body.model = env.OPENAI_MODEL || "gpt-5.5";

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    },
  });
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
      description: body.description || "Hardware project generated with CircuitCodex",
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

