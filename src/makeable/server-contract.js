import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

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
export const PUBLISH_CAPABILITY_TTL_MS = 5 * 60 * 1000;
export const GITHUB_RECOVERY_MARKER_PREFIX = "[makeable:v1:";

export function createPublicConfig(env, extras = {}) {
  return {
    githubOwner: env.GITHUB_OWNER || "",
    openaiModel: env.OPENAI_MODEL || "gpt-5.6-terra",
    openaiReasoningModel: env.OPENAI_REASONING_MODEL || "gpt-5.6-terra",
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
        ttl_seconds: DEEPGRAM_TOKEN_TTL_SECONDS,
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
  const unexpected = unexpectedKeys(body, [
    "name",
    "description",
    "private",
    "recoverySecret",
  ]);
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
  if (!validateRecoverySecret(body.recoverySecret)) {
    return invalidGitHubRequest("A valid project recovery secret is required.");
  }
  return {
    ok: true,
    value: {
      owner,
      name: repo,
      description: createGitHubRepositoryDescription(
        String(body.description || "").trim() ||
          "Hardware project built with Makeable",
        body.recoverySecret,
      ),
      private: body.private,
      recoverySecret: body.recoverySecret,
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
    "capability",
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
  if (
    typeof body.capability !== "string" ||
    !body.capability ||
    body.capability.length > 4096
  ) {
    return invalidGitHubRequest("A publish capability is required.");
  }
  return {
    ok: true,
    value: {
      owner,
      repo,
      path: body.path,
      content: body.content,
      capability: body.capability,
    },
  };
}

export function validateGitHubRecoveryRequest(body, configuredOwner) {
  const owner = validateGitHubOwner(configuredOwner);
  if (!owner) return invalidGitHubRequest("GITHUB_OWNER is not configured.", 503);
  if (!isPlainObject(body)) {
    return invalidGitHubRequest("A JSON object is required.");
  }
  const unexpected = unexpectedKeys(body, ["repo", "recoverySecret"]);
  if (unexpected.length) {
    return invalidGitHubRequest(`Unsupported field: ${unexpected[0]}.`);
  }
  const repo = validateGitHubRepositoryName(body.repo);
  if (!repo) return invalidGitHubRequest("Invalid repository name.");
  if (!validateRecoverySecret(body.recoverySecret)) {
    return invalidGitHubRequest("A valid project recovery secret is required.");
  }
  return {
    ok: true,
    value: { owner, repo, recoverySecret: body.recoverySecret },
  };
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

export function createGitHubRecoveryProof(recoverySecret) {
  if (!validateRecoverySecret(recoverySecret)) {
    throw new TypeError("A 256-bit hexadecimal recovery secret is required.");
  }
  return createHash("sha256").update(recoverySecret, "utf8").digest("hex");
}

export function createGitHubRepositoryDescription(
  description,
  recoverySecret,
) {
  const clean = String(description || "Hardware project built with Makeable")
    .replace(/\s*\[makeable:v1:[a-f0-9]{64}\]\s*/gi, " ")
    .trim()
    .slice(0, 240);
  return `${clean} ${GITHUB_RECOVERY_MARKER_PREFIX}${createGitHubRecoveryProof(
    recoverySecret,
  )}]`;
}

export function repositoryMatchesRecoverySecret(description, recoverySecret) {
  if (
    typeof description !== "string" ||
    !validateRecoverySecret(recoverySecret)
  ) {
    return false;
  }
  const expected = `${GITHUB_RECOVERY_MARKER_PREFIX}${createGitHubRecoveryProof(
    recoverySecret,
  )}]`;
  const expectedBytes = Buffer.from(expected, "utf8");
  const marker = description.match(/\[makeable:v1:[a-f0-9]{64}\]/i)?.[0] || "";
  const markerBytes = Buffer.from(marker.toLowerCase(), "utf8");
  return (
    markerBytes.length === expectedBytes.length &&
    timingSafeEqual(markerBytes, expectedBytes)
  );
}

export function createPublishCapability(
  { owner, repo },
  githubToken,
  options = {},
) {
  const validatedOwner = validateGitHubOwner(owner);
  const validatedRepo = validateGitHubRepositoryName(repo);
  if (!validatedOwner || !validatedRepo || !githubToken) {
    throw new TypeError("A valid owner, repository, and server token are required.");
  }
  const now = Number(options.now ?? Date.now());
  const payload = {
    version: 1,
    owner: validatedOwner,
    repo: validatedRepo,
    paths: [...GITHUB_ARTIFACT_PATHS],
    issuedAt: now,
    expiresAt: now + PUBLISH_CAPABILITY_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = signCapability(encoded, githubToken);
  return {
    capability: `${encoded}.${signature}`,
    expiresAt: payload.expiresAt,
  };
}

export function verifyPublishCapability(
  capability,
  { owner, repo, path },
  githubToken,
  options = {},
) {
  try {
    if (typeof capability !== "string" || !githubToken) {
      return invalidCapability();
    }
    const [encoded, signature, extra] = capability.split(".");
    if (!encoded || !signature || extra) return invalidCapability();
    const expected = Buffer.from(signCapability(encoded, githubToken), "utf8");
    const received = Buffer.from(signature, "utf8");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      return invalidCapability();
    }
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    const now = Number(options.now ?? Date.now());
    const validPaths =
      Array.isArray(payload.paths) &&
      payload.paths.length === GITHUB_ARTIFACT_PATHS.length &&
      GITHUB_ARTIFACT_PATHS.every(
        (candidate, index) => payload.paths[index] === candidate,
      );
    if (
      payload.version !== 1 ||
      payload.owner !== owner ||
      payload.repo !== repo ||
      !validPaths ||
      !payload.paths.includes(path) ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.issuedAt > now + 30_000 ||
      payload.expiresAt <= now ||
      payload.expiresAt - payload.issuedAt !== PUBLISH_CAPABILITY_TTL_MS
    ) {
      return invalidCapability();
    }
    return { ok: true, expiresAt: payload.expiresAt };
  } catch {
    return invalidCapability();
  }
}

function signCapability(encodedPayload, githubToken) {
  const key = createHmac("sha256", githubToken)
    .update("makeable-publish-capability-key:v1", "utf8")
    .digest();
  return createHmac("sha256", key)
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

function invalidCapability() {
  return { ok: false, error: "Publish capability is invalid or expired." };
}

function validateRecoverySecret(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
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
