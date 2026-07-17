export const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
export const DEEPGRAM_TOKEN_TTL_SECONDS = 60;
export const GITHUB_ARTIFACT_PATHS = Object.freeze([
  "README.md",
  "build-guide/README.md",
  "code/makeable.ino",
  "parts-list/README.md",
  "test-results/README.md",
]);
export const GITHUB_MAX_CONTENT_BYTES = 1024 * 1024;
export const GITHUB_MAX_REQUEST_BYTES = GITHUB_MAX_CONTENT_BYTES + 32 * 1024;

export function createPublicConfig(env, extras = {}) {
  return {
    githubOwner: env.GITHUB_OWNER || "",
    openaiModel: env.OPENAI_MODEL || "gpt-5.5",
    openaiReasoningModel: env.OPENAI_REASONING_MODEL || "gpt-5.5",
    openaiReasoningEffort: env.OPENAI_REASONING_EFFORT || "high",
    arduinoFqbn: env.ARDUINO_FQBN || "esp32:esp32:esp32",
    hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
    hasDeepgramKey: Boolean(env.DEEPGRAM_API_KEY),
    hasGithubToken: Boolean(env.GITHUB_TOKEN),
    ...extras,
  };
}

export function createPublicConfigScript(config) {
  return [
    `window.MAKEABLE_CONFIG = ${JSON.stringify(config)};`,
    "window.CIRCUIT_CODEX_CONFIG = window.MAKEABLE_CONFIG;",
  ].join("\n");
}

export async function grantDeepgramToken(apiKey, fetchImpl = globalThis.fetch) {
  if (!apiKey) {
    return {
      status: 503,
      body: { error: "Speech transcription is not configured" },
    };
  }

  try {
    const upstream = await fetchImpl(DEEPGRAM_GRANT_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        time_to_live_in_seconds: DEEPGRAM_TOKEN_TTL_SECONDS,
      }),
    });
    if (!upstream.ok) return safeGrantError();

    const payload = await upstream.json();
    const expiresIn = payload.expires_in;
    if (
      typeof payload.access_token !== "string" ||
      !payload.access_token ||
      typeof expiresIn !== "number" ||
      !Number.isInteger(expiresIn) ||
      expiresIn <= 0 ||
      expiresIn > DEEPGRAM_TOKEN_TTL_SECONDS
    ) {
      return safeGrantError();
    }
    return {
      status: 200,
      body: {
        access_token: payload.access_token,
        expires_in: expiresIn,
      },
    };
  } catch {
    return safeGrantError();
  }
}

export function validateGitHubRepositoryRequest(body, configuredOwner) {
  const owner = validateGitHubOwner(configuredOwner);
  if (!owner) return invalidGitHubRequest("GITHUB_OWNER is not configured.", 503);
  if (!isPlainObject(body)) {
    return invalidGitHubRequest("A JSON object is required.");
  }
  const unexpected = unexpectedKeys(body, ["name", "description", "private"]);
  if (unexpected.length) {
    return invalidGitHubRequest(`Unsupported field: ${unexpected[0]}.`);
  }
  const repo = validateGitHubRepositoryName(body.name);
  if (!repo) return invalidGitHubRequest("Invalid repository name.");
  if (typeof body.private !== "boolean") {
    return invalidGitHubRequest("Repository visibility must be a boolean.");
  }
  if (
    body.description !== undefined &&
    (typeof body.description !== "string" ||
      byteLength(body.description) > 240)
  ) {
    return invalidGitHubRequest("Repository description is invalid.");
  }
  return {
    ok: true,
    value: {
      owner,
      name: repo,
      description:
        String(body.description || "").trim() ||
        "Hardware project built with Makeable",
      private: body.private,
    },
  };
}

export function validateGitHubUploadRequest(body, configuredOwner) {
  const owner = validateGitHubOwner(configuredOwner);
  if (!owner) return invalidGitHubRequest("GITHUB_OWNER is not configured.", 503);
  if (!isPlainObject(body)) {
    return invalidGitHubRequest("A JSON object is required.");
  }
  const unexpected = unexpectedKeys(body, [
    "owner",
    "repo",
    "path",
    "content",
    "message",
  ]);
  if (unexpected.length) {
    return invalidGitHubRequest(`Unsupported field: ${unexpected[0]}.`);
  }
  if (
    body.owner !== undefined &&
    (typeof body.owner !== "string" ||
      body.owner.toLowerCase() !== owner.toLowerCase())
  ) {
    return invalidGitHubRequest("The repository owner is not allowed.");
  }
  const repo = validateGitHubRepositoryName(body.repo);
  if (!repo) return invalidGitHubRequest("Invalid repository name.");
  if (
    typeof body.path !== "string" ||
    !GITHUB_ARTIFACT_PATHS.includes(body.path)
  ) {
    return invalidGitHubRequest("The artifact path is not allowed.");
  }
  if (
    typeof body.content !== "string" ||
    byteLength(body.content) > GITHUB_MAX_CONTENT_BYTES
  ) {
    return invalidGitHubRequest("The artifact content is invalid or too large.");
  }
  if (
    body.message !== undefined &&
    (typeof body.message !== "string" || byteLength(body.message) > 240)
  ) {
    return invalidGitHubRequest("The commit message is invalid.");
  }
  return {
    ok: true,
    value: {
      owner,
      repo,
      path: body.path,
      content: body.content,
    },
  };
}

export function validateGitHubLookupRequest(repoName, configuredOwner) {
  const owner = validateGitHubOwner(configuredOwner);
  if (!owner) return invalidGitHubRequest("GITHUB_OWNER is not configured.", 503);
  const repo = validateGitHubRepositoryName(repoName);
  if (!repo) return invalidGitHubRequest("Invalid repository name.");
  return { ok: true, value: { owner, repo } };
}

export function safeGitHubRepositoryMetadata(
  raw,
  configuredOwner,
  expectedRepo,
) {
  const owner = validateGitHubOwner(configuredOwner);
  const repo = validateGitHubRepositoryName(expectedRepo);
  const upstreamOwner = validateGitHubOwner(raw?.owner?.login);
  const upstreamName = validateGitHubRepositoryName(raw?.name);
  if (
    !owner ||
    !repo ||
    !upstreamOwner ||
    !upstreamName ||
    owner.toLowerCase() !== upstreamOwner.toLowerCase() ||
    repo.toLowerCase() !== upstreamName.toLowerCase() ||
    typeof raw?.private !== "boolean"
  ) {
    return null;
  }
  return {
    owner,
    name: upstreamName,
    html_url: `https://github.com/${owner}/${upstreamName}`,
    private: raw.private,
  };
}

function validateGitHubOwner(value) {
  const owner = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner) &&
    !owner.endsWith("-") &&
    !owner.includes("--")
    ? owner
    : "";
}

function validateGitHubRepositoryName(value) {
  const repo = String(value || "").trim();
  return repo.length <= 100 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/.test(repo) &&
    !repo.includes("..")
    ? repo
    : "";
}

function invalidGitHubRequest(error, status = 400) {
  return { ok: false, status, error };
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function unexpectedKeys(value, allowed) {
  const allowlist = new Set(allowed);
  return Object.keys(value).filter((key) => !allowlist.has(key));
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || "")).byteLength;
}

function safeGrantError() {
  return {
    status: 502,
    body: { error: "Unable to create a speech token" },
  };
}
