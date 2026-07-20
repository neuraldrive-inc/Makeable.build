import { createHash, randomBytes } from "node:crypto";
import { waitlistSignupKey } from "./waitlist-storage.mjs";

export const WAITLIST_SESSION_COOKIE = "__Host-makeable_waitlist";
export const WAITLIST_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SIGNUP_KEY_PATTERN = /^signup-[a-f0-9]{64}$/;

export function waitlistSessionStoreName(context) {
  return context && context !== "production"
    ? "waitlist-sessions-preview"
    : "waitlist-sessions";
}

export function waitlistSessionStoreNameForFunctionContext(context) {
  const deployContext =
    typeof context?.deploy?.context === "string" ? context.deploy.context : "";
  return waitlistSessionStoreName(deployContext);
}

export function waitlistSessionKey(token) {
  return `session-${createHash("sha256").update(token).digest("hex")}`;
}

export async function createWaitlistSession(store, signupKey, options = {}) {
  if (!SIGNUP_KEY_PATTERN.test(signupKey)) {
    throw new Error("A verified waitlist signup key is required");
  }
  const now = validDate(options.now ?? Date.now());
  const maxAgeSeconds = positiveInteger(
    options.maxAgeSeconds,
    WAITLIST_SESSION_MAX_AGE_SECONDS,
  );
  const token = (options.randomBytesImpl || randomBytes)(SESSION_TOKEN_BYTES)
    .toString("base64url");
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    throw new Error("Waitlist session token generation failed");
  }
  const record = {
    schemaVersion: 1,
    signupKey,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + maxAgeSeconds * 1_000).toISOString(),
  };
  const key = waitlistSessionKey(token);
  await store.set(
    key,
    new Blob([JSON.stringify(record)], { type: "application/json" }),
  );
  const stored = await store.get(key, { type: "json", consistency: "strong" });
  if (!sameSessionRecord(stored, record)) {
    throw new Error("Waitlist browser confirmation could not be verified after storage");
  }
  return {
    token,
    record,
    cookie: waitlistSessionCookie(token, maxAgeSeconds),
  };
}

export async function resolveWaitlistSession(request, options) {
  const cookie = waitlistSessionCookieState(request);
  if (cookie.state === "missing") return { joined: false, clearCookie: false };
  if (cookie.state === "invalid") {
    return { joined: false, clearCookie: true };
  }
  const token = cookie.token;

  const sessionKey = waitlistSessionKey(token);
  const session = await options.sessionStore.get(sessionKey, {
    type: "json",
    consistency: "strong",
  });
  const now = validDate(options.now ?? Date.now());
  if (!validSessionRecord(session, now)) {
    await deleteQuietly(options.sessionStore, sessionKey);
    return { joined: false, clearCookie: true };
  }

  const signup = await options.signupStore.get(session.signupKey, {
    type: "json",
    consistency: "strong",
  });
  if (!validVerifiedSignup(signup, session.signupKey)) {
    await deleteQuietly(options.sessionStore, sessionKey);
    return { joined: false, clearCookie: true };
  }
  return { joined: true, clearCookie: false };
}

async function deleteQuietly(store, key) {
  try {
    await store.delete(key);
  } catch {
    // Invalid sessions remain unusable even if best-effort garbage collection fails.
  }
}

export function waitlistSessionCookieState(request) {
  const token = cookieValue(request.headers.get("cookie"), WAITLIST_SESSION_COOKIE);
  if (!token) return { state: "missing", token: "" };
  return SESSION_TOKEN_PATTERN.test(token)
    ? { state: "valid", token }
    : { state: "invalid", token: "" };
}

export async function forgetWaitlistSession(request, sessionStore) {
  const cookie = waitlistSessionCookieState(request);
  if (cookie.state === "valid") {
    await sessionStore.delete(waitlistSessionKey(cookie.token));
  }
}

export function waitlistSessionCookie(token, maxAgeSeconds) {
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    throw new Error("Waitlist session token is invalid");
  }
  return [
    `${WAITLIST_SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${positiveInteger(maxAgeSeconds, WAITLIST_SESSION_MAX_AGE_SECONDS)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

export function clearWaitlistSessionCookie() {
  return [
    `${WAITLIST_SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

function cookieValue(header, name) {
  if (typeof header !== "string" || !header) return "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return "";
}

function validSessionRecord(value, now) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    !SIGNUP_KEY_PATTERN.test(value.signupKey) ||
    typeof value.createdAt !== "string" ||
    typeof value.expiresAt !== "string"
  ) {
    return false;
  }
  const createdAt = new Date(value.createdAt);
  const expiresAt = new Date(value.expiresAt);
  return (
    !Number.isNaN(createdAt.getTime()) &&
    !Number.isNaN(expiresAt.getTime()) &&
    createdAt <= now &&
    expiresAt > now
  );
}

function validVerifiedSignup(value, expectedKey) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.source === "google" &&
    typeof value.email === "string" &&
    waitlistSignupKey(value.email) === expectedKey
  );
}

function sameSessionRecord(stored, expected) {
  return (
    stored &&
    typeof stored === "object" &&
    !Array.isArray(stored) &&
    stored.schemaVersion === expected.schemaVersion &&
    stored.signupKey === expected.signupKey &&
    stored.createdAt === expected.createdAt &&
    stored.expiresAt === expected.expiresAt
  );
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("A valid timestamp is required");
  return date;
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
