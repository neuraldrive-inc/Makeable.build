export const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
export const DEEPGRAM_TOKEN_TTL_SECONDS = 60;

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
    if (
      typeof payload.access_token !== "string" ||
      !payload.access_token ||
      !Number.isFinite(Number(payload.expires_in))
    ) {
      return safeGrantError();
    }
    return {
      status: 200,
      body: {
        access_token: payload.access_token,
        expires_in: Number(payload.expires_in),
      },
    };
  } catch {
    return safeGrantError();
  }
}

function safeGrantError() {
  return {
    status: 502,
    body: { error: "Unable to create a speech token" },
  };
}
