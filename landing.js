const config = window.MAKEABLE_CONFIG || {};
const status = document.querySelector("[data-signup-status]");
const googleSlot = document.querySelector("[data-google-slot]");
const googleFallback = document.querySelector("[data-google-fallback]");
let googleInitialized = false;
let googleButtonRendered = false;

setupWorkbenchComparison();
setupBuildStory();
setupMobileSignup();

document.querySelector("[data-current-year]")?.replaceChildren(
  document.createTextNode(String(new Date().getFullYear())),
);
for (const link of document.querySelectorAll('a[href="#join"]')) {
  link.addEventListener("click", () => {
    window.setTimeout(() => {
      const firstControl = googleSlot?.querySelector("button, iframe");
      firstControl?.focus({ preventScroll: true });
    });
  });
}

googleFallback?.addEventListener("click", () => {
  if (config.googleClientId) {
    setStatus("Google sign-in is still loading. Please try again in a moment.", "info");
    loadGoogleIdentity();
    return;
  }
  const isLocal =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";
  setStatus(
    isLocal
      ? "Google sign-in needs GOOGLE_CLIENT_ID in .env. Add the Web OAuth client ID, then restart Makeable."
      : "Google sign-in is temporarily unavailable. Please try again shortly.",
    "error",
  );
});

if (config.googleClientId && googleSlot) loadGoogleIdentity();

function loadGoogleIdentity() {
  if (!googleSlot || !config.googleClientId) return;
  if (window.google?.accounts?.id) {
    initializeGoogleIdentity();
    return;
  }
  if (document.querySelector('script[data-google-identity]')) return;

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.dataset.googleIdentity = "true";
  script.addEventListener("load", () => {
    initializeGoogleIdentity();
  });
  script.addEventListener("error", () => {
    script.remove();
    setStatus("Google sign-in could not load. Check your connection and try again.", "error");
  });
  document.head.append(script);
}

function initializeGoogleIdentity() {
  if (
    !window.google?.accounts?.id ||
    !googleSlot ||
    !config.googleClientId
  ) {
    return;
  }
  if (!googleInitialized) {
    window.google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: handleGoogleCredential,
      auto_select: false,
      ux_mode: "popup",
    });
    googleInitialized = true;
  }
  renderGoogleButton();
}

function renderGoogleButton() {
  if (
    googleButtonRendered ||
    !googleInitialized ||
    !window.google?.accounts?.id?.renderButton ||
    !googleSlot
  ) {
    return;
  }

  const buttonHost = document.createElement("div");
  const availableWidth = Math.floor(googleSlot.getBoundingClientRect().width - 16);
  const width = Math.min(400, Math.max(220, availableWidth));

  try {
    googleSlot.replaceChildren(buttonHost);
    window.google.accounts.id.renderButton(buttonHost, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
      width,
    });
    googleButtonRendered = true;
  } catch {
    googleSlot.replaceChildren(googleFallback);
    setStatus("Google sign-in could not load. Check your connection and try again.", "error");
  }
}

async function handleGoogleCredential(response) {
  const credential = response?.credential;
  if (!credential) {
    setStatus("Google sign-in did not return an identity. Please try again.", "error");
    return;
  }
  setStatus("Adding you to the waitlist…", "info");

  try {
    const apiResponse = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential,
        intent: "waitlist",
      }),
    });
    const payload = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      throw new Error(payload.error || "Google sign-in could not be completed.");
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
      <h2 id="signup-title" tabindex="-1">You’re on the list.</h2>
      <p>We’ll send your Makeable early-access invitation before August 9.</p>
      <button class="share-waitlist" type="button" data-share-waitlist>
        Share Makeable
      </button>
    </div>
  `;
  setStatus("Waitlist signup complete.", "success");
  content
    .querySelector("[data-share-waitlist]")
    ?.addEventListener("click", shareWaitlist);
  content.querySelector("h2")?.focus();
}

function setStatus(message, tone) {
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
  status.setAttribute("role", tone === "error" ? "alert" : "status");
}

async function shareWaitlist() {
  const shareData = {
    title: "Makeable",
    text:
      "Turn ideas into working physical products in hours. " +
      "Makeable early access opens August 9.",
    url: new URL("/", window.location.href).href,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      setStatus("Share sheet opened.", "success");
      return;
    }
    await navigator.clipboard.writeText(shareData.url);
    setStatus("Waitlist link copied.", "success");
  } catch (error) {
    if (error?.name === "AbortError") return;
    setStatus("Copy this page’s address to share Makeable.", "error");
  }
}

function setupBuildStory() {
  const root = document.querySelector("[data-story-root]");
  const chapters = [...document.querySelectorAll("[data-story-chapter]")];
  if (!root || !chapters.length) return;

  const activate = (chapter) => {
    const story = chapter.dataset.storyChapter;
    if (!story) return;
    root.dataset.activeStory = story;
    chapters.forEach((item) => {
      item.setAttribute("aria-current", String(item === chapter));
    });
  };

  activate(chapters[0]);
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) activate(visible.target);
    },
    { rootMargin: "-28% 0px -42% 0px", threshold: [0.15, 0.35, 0.55] },
  );
  chapters.forEach((chapter) => observer.observe(chapter));
}

function setupWorkbenchComparison() {
  const comparison = document.querySelector("[data-comparison]");
  const range = comparison?.querySelector("[data-comparison-range]");
  if (!comparison || !range) return;

  const updateReveal = () => {
    comparison.style.setProperty("--comparison-reveal", `${range.value}%`);
  };

  range.addEventListener("input", updateReveal);
  updateReveal();
}

function setupMobileSignup() {
  const anchor = document.querySelector("[data-signup-anchor]");
  const signup = anchor?.querySelector(".hero-signup");
  if (!anchor || !signup || !("IntersectionObserver" in window)) return;

  const mobile = window.matchMedia("(max-width: 1279px)");
  const clearStickyState = () => {
    signup.classList.remove("is-mobile-sticky");
    document.body.classList.remove("has-mobile-sticky-signup");
    document.body.style.removeProperty("--sticky-signup-clearance");
  };
  const update = (entry) => {
    if (!mobile.matches) {
      clearStickyState();
      return;
    }

    const shouldStick = entry.intersectionRatio < 0.98;
    signup.classList.toggle("is-mobile-sticky", shouldStick);
    document.body.classList.toggle("has-mobile-sticky-signup", shouldStick);
    if (shouldStick) {
      document.body.style.setProperty(
        "--sticky-signup-clearance",
        `${Math.ceil(signup.getBoundingClientRect().height + 40)}px`,
      );
    } else {
      document.body.style.removeProperty("--sticky-signup-clearance");
    }
  };

  const observer = new IntersectionObserver(([entry]) => update(entry), {
    threshold: [0, 0.98, 1],
  });
  observer.observe(anchor);
  mobile.addEventListener("change", () => {
    if (!mobile.matches) clearStickyState();
  });
}
