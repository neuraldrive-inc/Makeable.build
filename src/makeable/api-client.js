const AUTH_STORAGE_KEY = "makeable.auth.v1";
const AUTH_FLOW_KEY = "makeable.auth.flow.v1";
const GENERATION_STORAGE_KEY = "makeable.generation.v1";
const BACKGROUND_TIMEOUT_MS = 8 * 60 * 1000;
const PROTECTED_API_PATH = /^\/api\/(account|openai|firmware|github|deepgram)(\/|$)/;

const runtime = {
  window: null,
  config: {},
  auth: null,
  account: null,
  generationId: "",
  accountButtonBound: false,
};

export async function initializeApiClient(windowLike = globalThis.window) {
  if (!windowLike) return null;
  runtime.window = windowLike;
  runtime.config = { ...(windowLike.MAKEABLE_CONFIG || {}) };
  runtime.auth = readStoredJson(AUTH_STORAGE_KEY);
  runtime.generationId = readStoredGenerationId();

  try {
    const response = await windowLike.fetch("/api/config", {
      headers: { Accept: "application/json" },
    });
    if (response.ok) runtime.config = { ...runtime.config, ...(await response.json()) };
  } catch (error) {
    console.warn("Makeable could not refresh its server configuration.", error);
  }

  windowLike.MAKEABLE_CONFIG = runtime.config;
  windowLike.MAKEABLE_API_FETCH = apiFetch;
  windowLike.MAKEABLE_AUTH = Object.freeze({
    fetch: apiFetch,
    beginGeneration,
    resetGeneration,
    startSignIn,
    signOut,
    get account() {
      return runtime.account;
    },
    get projectKey() {
      return currentProjectKey();
    },
  });

  bindAccountControls();
  if (!runtime.config.hasAccounts) {
    renderAccount();
    return windowLike.MAKEABLE_AUTH;
  }

  try {
    const params = new URLSearchParams(windowLike.location.search);
    if (params.has("error")) {
      throw new Error(
        params.get("error_description") || params.get("error") || "Sign-in was cancelled.",
      );
    }
    if (params.has("code")) await finishSignIn(params);
    if (await getAccessToken({ interactive: false })) await refreshAccount();
  } catch (error) {
    console.error("Makeable sign-in initialization failed.", error);
    saveAuth(null);
    setAccountMessage(error.message || "Sign-in needs another try.");
  }
  renderAccount();
  return windowLike.MAKEABLE_AUTH;
}

export async function apiFetch(input, options = {}) {
  const path = requestPath(input);
  const method = String(options.method || "GET").toUpperCase();
  const generationId = options.generationId || (path.startsWith("/api/openai/") ? ensureGenerationId() : "");
  const fetchOptions = { ...options };
  delete fetchOptions.generationId;

  if (
    path === "/api/openai/responses" &&
    method === "POST" &&
    runtime.config.apiBaseUrl
  ) {
    return backgroundOpenAiResponse(fetchOptions, generationId);
  }

  const response = await performApiFetch(input, fetchOptions, generationId);
  if (path.startsWith("/api/openai/") && runtime.auth?.accessToken) {
    refreshAccountSoon();
  }
  return response;
}

export function beginGeneration() {
  const windowLike = runtime.window;
  const id = windowLike?.crypto?.randomUUID?.() || randomBase64Url(24);
  runtime.generationId = id;
  try {
    windowLike?.sessionStorage?.setItem(GENERATION_STORAGE_KEY, id);
  } catch {
    // A private browser session can block storage; the in-memory id still scopes the request.
  }
  return id;
}

export function resetGeneration() {
  runtime.generationId = "";
  try {
    runtime.window?.sessionStorage?.removeItem(GENERATION_STORAGE_KEY);
  } catch {
    // Nothing else is required when session storage is unavailable.
  }
}

export function currentProjectKey() {
  const claims = decodeJwtPayload(runtime.auth?.idToken || runtime.auth?.accessToken || "");
  const userId = String(claims?.sub || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return userId ? `account-${userId}` : "guest";
}

export async function startSignIn() {
  const windowLike = runtime.window;
  if (!windowLike || !runtime.config.cognitoDomain || !runtime.config.cognitoClientId) {
    throw new Error("Sign-in is not configured yet.");
  }
  const verifier = randomBase64Url(64);
  const loginState = randomBase64Url(32);
  const challengeBytes = await windowLike.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = bytesToBase64Url(new Uint8Array(challengeBytes));
  const returnPath = /^\/build\//.test(windowLike.location.pathname)
    ? `${windowLike.location.pathname}${windowLike.location.hash}`
    : "/build/new";
  writeStoredJson(AUTH_FLOW_KEY, { verifier, loginState, returnPath });

  const authorizeUrl = new URL("/oauth2/authorize", normalizedCognitoDomain());
  authorizeUrl.search = new URLSearchParams({
    client_id: runtime.config.cognitoClientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: authRedirectUri(),
    state: loginState,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  windowLike.location.assign(authorizeUrl);
}

export function signOut() {
  const windowLike = runtime.window;
  saveAuth(null);
  runtime.account = null;
  resetGeneration();
  if (!windowLike || !runtime.config.cognitoDomain || !runtime.config.cognitoClientId) return;
  const logoutUrl = new URL("/logout", normalizedCognitoDomain());
  logoutUrl.search = new URLSearchParams({
    client_id: runtime.config.cognitoClientId,
    logout_uri: authRedirectUri(),
  });
  windowLike.location.assign(logoutUrl);
}

async function backgroundOpenAiResponse(options, generationId) {
  const startedResponse = await performApiFetch(
    "/api/openai/background",
    { ...options, method: "POST" },
    generationId,
  );
  if ([404, 405].includes(startedResponse.status)) {
    return performApiFetch("/api/openai/responses", options, generationId);
  }
  if (!startedResponse.ok) return startedResponse;

  let latest = await safeJson(startedResponse);
  if (!latest?.id || isTerminalOpenAiStatus(latest.status)) {
    refreshAccountSoon();
    return jsonResponse(latest, startedResponse.status);
  }

  const startedAt = Date.now();
  let pollCount = 0;
  while (Date.now() - startedAt < BACKGROUND_TIMEOUT_MS) {
    await delay(Math.min(6500, 2200 + pollCount * 450), options.signal);
    const response = await performApiFetch(
      `/api/openai/responses/${encodeURIComponent(latest.id)}`,
      { method: "GET", signal: options.signal },
      generationId,
    );
    if (!response.ok) return response;
    latest = await safeJson(response);
    if (isTerminalOpenAiStatus(latest.status)) {
      refreshAccountSoon();
      return jsonResponse(latest, response.status);
    }
    pollCount += 1;
  }

  return jsonResponse(
    { error: "The AI request is still running. Please retry in a moment." },
    504,
  );
}

async function performApiFetch(input, options, generationId = "") {
  const windowLike = runtime.window;
  if (!windowLike) throw new Error("Makeable’s API client is not initialized.");
  const path = requestPath(input);
  const protectedRequest = PROTECTED_API_PATH.test(path);
  const headers = new windowLike.Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type") && !(options.body instanceof windowLike.FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (protectedRequest) {
    const accessToken = await getAccessToken({ interactive: true });
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  } else {
    const accessToken = await getAccessToken({ interactive: false });
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (generationId) headers.set("X-Makeable-Generation-Id", generationId);

  const requestUrl = resolveRequestUrl(input);
  let response = await windowLike.fetch(requestUrl, { ...options, headers });
  if (protectedRequest && response.status === 401 && runtime.auth?.refreshToken) {
    const replacementToken = await refreshAccessToken();
    if (replacementToken) {
      headers.set("Authorization", `Bearer ${replacementToken}`);
      response = await windowLike.fetch(requestUrl, { ...options, headers });
    }
  }
  return response;
}

async function finishSignIn(params) {
  const flow = readStoredJson(AUTH_FLOW_KEY);
  if (!flow?.verifier || !flow?.loginState || params.get("state") !== flow.loginState) {
    throw new Error("The sign-in response could not be verified. Please try again.");
  }
  const response = await runtime.window.fetch(new URL("/oauth2/token", normalizedCognitoDomain()), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: runtime.config.cognitoClientId,
      code: params.get("code") || "",
      redirect_uri: authRedirectUri(),
      code_verifier: flow.verifier,
    }),
  });
  const tokens = await safeJson(response);
  if (!response.ok) {
    throw new Error(tokens.error_description || tokens.error || "Could not complete sign-in.");
  }
  saveAuth({
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
  });
  removeStoredValue(AUTH_FLOW_KEY);
  const returnPath = /^\/build\//.test(flow.returnPath || "") ? flow.returnPath : "/build/new";
  runtime.window.history.replaceState(null, "", returnPath);
}

async function getAccessToken({ interactive = true } = {}) {
  if (!runtime.config.hasAccounts) return "";
  if (runtime.auth?.accessToken && Number(runtime.auth.expiresAt || 0) > Date.now() + 30_000) {
    return runtime.auth.accessToken;
  }
  if (runtime.auth?.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return refreshed;
  }
  if (interactive) {
    await startSignIn();
    throw new Error("Opening sign-in…");
  }
  return "";
}

async function refreshAccessToken() {
  if (!runtime.auth?.refreshToken) return "";
  try {
    const response = await runtime.window.fetch(new URL("/oauth2/token", normalizedCognitoDomain()), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: runtime.config.cognitoClientId,
        refresh_token: runtime.auth.refreshToken,
      }),
    });
    const tokens = await safeJson(response);
    if (!response.ok || !tokens.access_token) {
      throw new Error(tokens.error_description || tokens.error || "Token refresh failed.");
    }
    saveAuth({
      ...runtime.auth,
      accessToken: tokens.access_token,
      idToken: tokens.id_token || runtime.auth.idToken,
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    });
    return runtime.auth.accessToken;
  } catch (error) {
    console.error("Makeable token refresh failed.", error);
    saveAuth(null);
    resetGeneration();
    return "";
  }
}

async function refreshAccount() {
  if (!runtime.auth?.accessToken) return null;
  const response = await performApiFetch("/api/account", { method: "GET" });
  if (!response.ok) {
    if (response.status === 401) {
      saveAuth(null);
      resetGeneration();
    }
    return null;
  }
  runtime.account = await safeJson(response);
  renderAccount();
  return runtime.account;
}

function refreshAccountSoon() {
  runtime.window?.setTimeout?.(() => refreshAccount().catch(() => {}), 0);
}

function bindAccountControls() {
  if (runtime.accountButtonBound) return;
  const button = runtime.window?.document?.querySelector("#accountButton");
  if (!button) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (runtime.auth?.accessToken) signOut();
      else await startSignIn();
    } catch (error) {
      setAccountMessage(error.message || "Sign-in needs another try.");
      button.disabled = false;
    }
  });
  runtime.accountButtonBound = true;
}

function renderAccount() {
  const document = runtime.window?.document;
  if (!document) return;
  const button = document.querySelector("#accountButton");
  const name = document.querySelector("#accountName");
  const badge = document.querySelector("#creditBadge");
  const claims = decodeJwtPayload(runtime.auth?.idToken || runtime.auth?.accessToken || "");
  const signedIn = Boolean(runtime.auth?.accessToken && claims);
  if (button) {
    button.textContent = signedIn ? "Sign out" : "Sign in";
    button.disabled = !runtime.config.hasAccounts;
  }
  if (name) {
    name.textContent = signedIn
      ? String(claims.email || claims["cognito:username"] || claims.username || "Maker")
      : runtime.config.hasAccounts
        ? "10 free generations"
        : "Local preview";
  }
  if (badge) {
    badge.hidden = !signedIn || !runtime.account;
    badge.textContent = runtime.account
      ? `${runtime.account.credits ?? 0} credit${runtime.account.credits === 1 ? "" : "s"}`
      : "";
  }
}

function setAccountMessage(message) {
  const name = runtime.window?.document?.querySelector("#accountName");
  if (name) name.textContent = message;
}

function saveAuth(auth) {
  runtime.auth = auth;
  if (!auth) runtime.account = null;
  if (auth) writeStoredJson(AUTH_STORAGE_KEY, auth);
  else removeStoredValue(AUTH_STORAGE_KEY);
  renderAccount();
}

function readStoredJson(key) {
  try {
    return JSON.parse(runtime.window?.sessionStorage?.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeStoredJson(key, value) {
  try {
    runtime.window?.sessionStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Continue with in-memory state when browser storage is unavailable.
  }
}

function removeStoredValue(key) {
  try {
    runtime.window?.sessionStorage?.removeItem(key);
  } catch {
    // Nothing else is required when session storage is unavailable.
  }
}

function readStoredGenerationId() {
  try {
    const value = runtime.window?.sessionStorage?.getItem(GENERATION_STORAGE_KEY) || "";
    return /^[a-zA-Z0-9_-]{8,100}$/.test(value) ? value : "";
  } catch {
    return "";
  }
}

function ensureGenerationId() {
  return runtime.generationId || beginGeneration();
}

function normalizedCognitoDomain() {
  const value = String(runtime.config.cognitoDomain || "").trim();
  return value.startsWith("http") ? value : `https://${value}`;
}

function authRedirectUri() {
  return runtime.config.cognitoRedirectUri || `${runtime.window.location.origin}/`;
}

function resolveRequestUrl(input) {
  if (typeof input !== "string" || !input.startsWith("/api/")) return input;
  if (input === "/api/config") return input;
  const base = String(runtime.config.apiBaseUrl || "").replace(/\/$/, "");
  return base ? `${base}${input}` : input;
}

function requestPath(input) {
  if (typeof input === "string") {
    try {
      return new URL(input, runtime.window?.location?.origin || "http://localhost").pathname;
    } catch {
      return input;
    }
  }
  if (input instanceof URL) return input.pathname;
  return String(input?.url || "");
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token).split(".")[1] || "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(runtime.window.atob(padded));
  } catch {
    return null;
  }
}

function randomBase64Url(length) {
  const bytes = new Uint8Array(length);
  runtime.window.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return runtime.window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isTerminalOpenAiStatus(status) {
  const normalized = String(status || "completed").toLowerCase();
  return ["completed", "failed", "cancelled", "incomplete"].includes(normalized);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function jsonResponse(data, status = 200) {
  return new runtime.window.Response(JSON.stringify(data || {}), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new runtime.window.DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const timer = runtime.window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        runtime.window.clearTimeout(timer);
        reject(new runtime.window.DOMException("The operation was aborted.", "AbortError"));
      },
      { once: true },
    );
  });
}
