import { createHmac, timingSafeEqual } from "node:crypto";

const CAPABILITY_VERSION = 1;
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export function createPublishCapability(
  { userId, owner, repositoryName },
  secret,
  { now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {},
) {
  const payload = normalizedPayload({
    version: CAPABILITY_VERSION,
    userId,
    owner,
    repositoryName,
    expiresAt: now + ttlMs,
  });
  if (!payload || !secret) throw new Error("A publish capability could not be created.");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyPublishCapability(
  capability,
  { userId, owner, repositoryName },
  secret,
  { now = Date.now() } = {},
) {
  if (!secret || typeof capability !== "string") return false;
  const [encoded, suppliedSignature, extra] = capability.split(".");
  if (!encoded || !suppliedSignature || extra) return false;
  const expectedSignature = signature(encoded, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;

  let payload;
  try {
    payload = normalizedPayload(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
  } catch {
    return false;
  }
  if (!payload || payload.expiresAt < now) return false;
  return (
    payload.version === CAPABILITY_VERSION &&
    payload.userId === String(userId || "") &&
    payload.owner.toLowerCase() === String(owner || "").toLowerCase() &&
    payload.repositoryName === String(repositoryName || "")
  );
}

function normalizedPayload({ version, userId, owner, repositoryName, expiresAt }) {
  const payload = {
    version: Number(version),
    userId: String(userId || "").trim(),
    owner: String(owner || "").trim(),
    repositoryName: String(repositoryName || "").trim(),
    expiresAt: Number(expiresAt),
  };
  if (
    payload.version !== CAPABILITY_VERSION ||
    !payload.userId ||
    !payload.owner ||
    !payload.repositoryName ||
    !Number.isFinite(payload.expiresAt)
  ) {
    return null;
  }
  return payload;
}

function signature(encoded, secret) {
  return createHmac("sha256", String(secret)).update(encoded).digest("base64url");
}
