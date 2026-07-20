import { createHash, createHmac } from "node:crypto";

const WEBHOOK_TIMEOUT_MS = 5_000;
const WEBHOOK_RETRY_DELAYS_MS = [0, 250, 1_000];

export function waitlistSignupKey(email) {
  return `signup-${createHash("sha256").update(email).digest("hex")}`;
}

export function waitlistStoreName(context) {
  return context && context !== "production" ? "waitlist-preview" : "waitlist";
}

export function waitlistStoreNameForFunctionContext(context) {
  const deployContext =
    typeof context?.deploy?.context === "string" ? context.deploy.context : "";
  return waitlistStoreName(deployContext);
}

export async function persistVerifiedWaitlistRecord(record, options) {
  const {
    store,
    webhookUrl = "",
    webhookSecret = "",
    fetchImpl = globalThis.fetch,
    waitUntil,
  } = options;
  const key = waitlistSignupKey(record.email);
  // @netlify/blobs 10.1.0 drops conditional options in setJSON(). The lower-level
  // set() path correctly emits If-None-Match: *, which makes this write atomic.
  const payload = new Blob([JSON.stringify(record)], { type: "application/json" });
  const write = await store.set(key, payload, { onlyIfNew: true });
  const created = write?.modified !== false;
  // The pinned Blobs client can also report non-412 HTTP failures as modified.
  // A strong read-back is therefore required before the UI may report success.
  const stored = await store.get(key, { type: "json", consistency: "strong" });
  if (!isVerifiedStoredRecord(stored, record, created)) {
    throw new Error("Waitlist record could not be verified after storage");
  }

  if (created && webhookUrl) {
    const delivery = deliverWebhook(record, key, {
      webhookUrl,
      webhookSecret,
      fetchImpl,
    }).catch((error) => {
      console.error("Waitlist webhook delivery failed", safeErrorMessage(error));
    });
    if (typeof waitUntil === "function") {
      waitUntil(delivery);
    } else {
      await delivery;
    }
  }

  return { created, key };
}

function isVerifiedStoredRecord(stored, submitted, created) {
  if (
    !stored ||
    typeof stored !== "object" ||
    Array.isArray(stored) ||
    stored.email !== submitted.email ||
    stored.source !== "google"
  ) {
    return false;
  }
  if (!created) return true;
  return (
    stored.createdAt === submitted.createdAt &&
    String(stored.name || "") === String(submitted.name || "")
  );
}

export async function deliverWebhook(record, eventId, options) {
  const url = parseWebhookUrl(options.webhookUrl);
  if (!options.webhookSecret) {
    throw new Error("WAITLIST_WEBHOOK_SECRET is required when a webhook is configured");
  }
  if (typeof options.fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for webhook delivery");
  }

  const body = JSON.stringify(record);
  let lastError;
  const retryDelays = options.retryDelaysMs || WEBHOOK_RETRY_DELAYS_MS;
  const timeoutMs = options.timeoutMs || WEBHOOK_TIMEOUT_MS;
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    const delay = retryDelays[attempt];
    if (delay) await wait(delay);
    try {
      const timestamp = String(Math.floor(Date.now() / 1_000));
      const signature = createHmac("sha256", options.webhookSecret)
        .update(`${timestamp}.${body}`)
        .digest("hex");
      const response = await fetchWithTimeout(
        options.fetchImpl,
        url.href,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": eventId,
            "X-Makeable-Event-Id": eventId,
            "X-Makeable-Timestamp": timestamp,
            "X-Makeable-Signature": `v1=${signature}`,
          },
          body,
        },
        timeoutMs,
      );
      if (response.ok) return;
      lastError = new Error(`Webhook returned HTTP ${response.status}`);
      if (response.status < 500 && response.status !== 408 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Webhook delivery failed");
}

function parseWebhookUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Waitlist webhooks must use HTTPS");
  return url;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown webhook error";
}
