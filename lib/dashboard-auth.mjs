import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const DASHBOARD_SESSION_COOKIE = "__Host-makeable_dashboard";
export const DASHBOARD_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const ACCESS_KEY_MIN_LENGTH = 10;
const SESSION_SECRET_MIN_LENGTH = 32;
const SESSION_NONCE_BYTES = 24;
const SESSION_PATTERN = /^(\d{10})\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/;

export function dashboardAccessConfigured(accessKey, sessionSecret) {
  return (
    typeof accessKey === "string" &&
    accessKey.length >= ACCESS_KEY_MIN_LENGTH &&
    typeof sessionSecret === "string" &&
    sessionSecret.length >= SESSION_SECRET_MIN_LENGTH
  );
}

export function verifyDashboardAccessKey(value, expected) {
  if (typeof value !== "string" || typeof expected !== "string") return false;
  const actualDigest = createHash("sha256").update(value).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function createDashboardSessionCookie(sessionSecret, options = {}) {
  if (typeof sessionSecret !== "string" || sessionSecret.length < SESSION_SECRET_MIN_LENGTH) {
    throw new Error("A strong dashboard session secret is required");
  }
  const now = validDate(options.now ?? Date.now());
  const maxAgeSeconds = positiveInteger(
    options.maxAgeSeconds,
    DASHBOARD_SESSION_MAX_AGE_SECONDS,
  );
  const expiresAt = Math.floor(now.getTime() / 1_000) + maxAgeSeconds;
  const nonce = (options.randomBytesImpl || randomBytes)(SESSION_NONCE_BYTES)
    .toString("base64url");
  const payload = `${expiresAt}.${nonce}`;
  const signature = signDashboardSession(payload, sessionSecret);
  const token = `${payload}.${signature}`;
  return [
    `${DASHBOARD_SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

export function dashboardSessionState(request, sessionSecret, options = {}) {
  const token = cookieValue(request.headers.get("cookie"), DASHBOARD_SESSION_COOKIE);
  if (!token) return { state: "missing", authenticated: false };
  const match = token.match(SESSION_PATTERN);
  if (!match || typeof sessionSecret !== "string") {
    return { state: "invalid", authenticated: false };
  }

  const now = validDate(options.now ?? Date.now());
  const expiresAt = Number(match[1]);
  const latestAllowedExpiry =
    Math.floor(now.getTime() / 1_000) + DASHBOARD_SESSION_MAX_AGE_SECONDS;
  const payload = `${match[1]}.${match[2]}`;
  const expected = signDashboardSession(payload, sessionSecret);
  const signatureMatches = timingSafeEqual(
    Buffer.from(match[3]),
    Buffer.from(expected),
  );
  if (
    !signatureMatches ||
    expiresAt <= Math.floor(now.getTime() / 1_000) ||
    expiresAt > latestAllowedExpiry
  ) {
    return { state: "invalid", authenticated: false };
  }
  return { state: "valid", authenticated: true, expiresAt };
}

export function clearDashboardSessionCookie() {
  return [
    `${DASHBOARD_SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

function signDashboardSession(payload, sessionSecret) {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
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

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("A valid timestamp is required");
  return date;
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
