const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createGoogleWaitlistResult(identity, intent, options = {}) {
  if (intent !== "waitlist") {
    return invalid("This Google sign-in destination is not supported.");
  }
  const email = normalizeEmail(identity?.email);
  const subject =
    typeof identity?.sub === "string" ? identity.sub.trim().slice(0, 255) : "";
  if (!email || identity?.email_verified !== true || !subject) {
    return {
      ok: false,
      status: 401,
      error: "Google could not verify this email address.",
    };
  }
  const name = cleanText(identity.name, 120);
  const picture = cleanPicture(identity.picture);
  return {
    ok: true,
    value: {
      user: { email, name, picture },
      record: {
        email,
        source: "google",
        createdAt: timestamp(options.now),
        name,
      },
    },
  };
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return "";
  return email;
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function cleanPicture(value) {
  if (typeof value !== "string") return "";
  const picture = value.trim();
  if (!picture || picture.length > 2048) return "";
  try {
    const url = new URL(picture);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return date.toISOString();
}

function invalid(error) {
  return { ok: false, status: 400, error };
}
