const isPilot = window.location.pathname.replace(/\/+$/, "") === "/pilot";
const config = window.MAKEABLE_CONFIG || {};
const status = document.querySelector("[data-signup-status]");
const googleSlot = document.querySelector("[data-google-slot]");
const googleFallback = document.querySelector("[data-google-fallback]");
const emailForm = document.querySelector("[data-email-form]");

document.querySelector("[data-current-year]")?.replaceChildren(
  document.createTextNode(String(new Date().getFullYear())),
);
for (const link of document.querySelectorAll('a[href="#join"]')) {
  link.addEventListener("click", () => {
    window.setTimeout(() => {
      const firstControl =
        googleSlot?.querySelector("button, iframe") ||
        emailForm?.querySelector("input");
      firstControl?.focus({ preventScroll: true });
    });
  });
}

emailForm?.addEventListener("submit", handleEmailSubmit);
googleFallback?.addEventListener("click", () => {
  if (config.googleClientId) {
    setStatus("Opening Google sign-in…", "info");
    loadGoogleIdentity();
    return;
  }
  setStatus(
    isPilot
      ? "Google sign-in is not configured for this pilot yet."
      : "Google sign-in is being connected. You can join with email right now.",
    "error",
  );
});

if (config.googleClientId && googleSlot) loadGoogleIdentity();

async function handleEmailSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const emailInput = form.elements.email;
  const submit = form.querySelector('button[type="submit"]');
  const email = String(emailInput?.value || "").trim();

  if (!emailInput?.checkValidity()) {
    emailInput?.reportValidity();
    setStatus("Enter a valid email address.", "error");
    return;
  }

  submit.disabled = true;
  submit.textContent = "Joining…";
  setStatus("Adding you to the waitlist…", "info");

  try {
    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Waitlist signup failed.");
    showWaitlistSuccess();
  } catch (error) {
    setStatus(
      error.message ||
        "We couldn’t add you just now. Your email is still here—please try again.",
      "error",
    );
    submit.disabled = false;
    submit.textContent = "Join the waitlist";
  }
}

function loadGoogleIdentity() {
  if (!googleSlot || !config.googleClientId) return;
  if (window.google?.accounts?.id) {
    renderGoogleButton();
    return;
  }
  if (document.querySelector('script[data-google-identity]')) return;

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.dataset.googleIdentity = "true";
  script.addEventListener("load", renderGoogleButton);
  script.addEventListener("error", () => {
    setStatus(
      isPilot
        ? "Google sign-in could not load. Check your connection and try again."
        : "Google sign-in could not load. You can still join with email.",
      "error",
    );
  });
  document.head.append(script);
}

function renderGoogleButton() {
  if (!window.google?.accounts?.id || !googleSlot || !config.googleClientId) return;
  googleSlot.replaceChildren();
  window.google.accounts.id.initialize({
    client_id: config.googleClientId,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  window.google.accounts.id.renderButton(googleSlot, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "rectangular",
    text: "continue_with",
    logo_alignment: "left",
    width: Math.min(390, Math.max(240, Math.round(googleSlot.clientWidth))),
  });
}

async function handleGoogleCredential(response) {
  const credential = response?.credential;
  if (!credential) {
    setStatus("Google sign-in did not return an identity. Please try again.", "error");
    return;
  }
  setStatus(
    isPilot ? "Opening your pilot bench…" : "Adding you to the waitlist…",
    "info",
  );

  try {
    const apiResponse = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential,
        intent: isPilot ? "pilot" : "waitlist",
      }),
    });
    const payload = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      throw new Error(payload.error || "Google sign-in could not be completed.");
    }
    if (isPilot) {
      window.sessionStorage.setItem(
        "makeable.pilot",
        JSON.stringify({
          authenticated: true,
          user: payload.user || {},
          signedInAt: new Date().toISOString(),
        }),
      );
      window.location.assign(payload.next || "/build/new");
      return;
    }
    showWaitlistSuccess();
  } catch (error) {
    setStatus(
      error.message || "Google sign-in could not be completed. Please try again.",
      "error",
    );
  }
}

function showWaitlistSuccess() {
  const content = document.querySelector("[data-signup-content]");
  if (!content) return;
  content.innerHTML = `
    <div class="signup-success">
      <img src="/assets/icons/lucide/check.svg" alt="" />
      <p class="annotation">That was it. You’re done.</p>
      <h2 tabindex="-1">You’re on the list.</h2>
      <p>We’ll send your Makeable early-access invitation before August 8.</p>
    </div>
  `;
  setStatus("Waitlist signup complete.", "success");
  content.querySelector("h2")?.focus();
}

function setStatus(message, tone) {
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}
