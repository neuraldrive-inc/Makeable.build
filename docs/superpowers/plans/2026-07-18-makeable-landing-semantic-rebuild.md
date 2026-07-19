# Makeable Landing Semantic Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Makeable waitlist landing page as semantic, responsive paper-card UI matching the approved reference without rasterized interface text.

**Architecture:** Keep the existing vanilla HTML/CSS/JavaScript architecture. Replace screenshot-derived UI fragments with semantic markup in `index.html`, consolidate visual construction in `styles/landing-v2.css`, and add one isolated mobile signup controller in `landing.js`. Hardware photography remains raster imagery; tests enforce that no UI text is embedded in the stage image assets.

**Tech Stack:** HTML5, CSS custom properties, vanilla JavaScript, Node built-in validation, Playwright, axe-core, self-hosted Fredoka/Nunito Sans/Shantell Sans.

## Global Constraints

- The supplied 1536×1024 landing screenshot is the visual composition source.
- Makeable colors, typography, spacing, radius, and paper shadow come from `Makeable figma/tokens/makeable.css`.
- Use exactly one `/assets/landing/desk-parts.jpeg` image in the comparison.
- UI copy, launch information, stage banners, chips, annotations, and status rows must be semantic HTML.
- Hardware photography must not contain duplicated interface text.
- Mobile target is 390×844 with 20px gutters and 24–32px section spacing.
- Google authentication and `/api/auth/google` behavior must remain compatible.
- Every behavior change follows red-green-refactor.

---

### Task 1: Lock the semantic construction with browser tests

**Files:**
- Modify: `tests/e2e/landing.spec.js`

**Interfaces:**
- Consumes: existing `/` landing page DOM.
- Produces: selectors and acceptance checks used by Tasks 2–5.

- [ ] **Step 1: Write the failing semantic construction test**

Add:

```js
test("landing UI is semantic instead of screenshot-derived", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".makeable-wordmark-text")).toHaveText("Makeable");
  await expect(page.locator(".launch-poster")).toContainText(
    "Early access opens August 9, 2026",
  );
  await expect(page.locator(".launch-poster img")).toHaveCount(0);
  await expect(page.locator(".paper-card")).toHaveCount(4);
  await expect(page.locator("[data-story-frame] img")).toHaveCount(3);
  await expect(page.locator("[data-story-frame] h2")).toHaveCount(3);
});
```

- [ ] **Step 2: Write the failing paper separation test**

Add:

```js
test("comparison and process stages are separate paper cards", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/");

  const cards = await page.locator(".landing-story-column .paper-card")
    .evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        top: rect.top,
        bottom: rect.bottom,
        border: style.borderTopWidth,
        shadow: style.boxShadow,
      };
    }));

  expect(cards).toHaveLength(4);
  for (let index = 1; index < cards.length; index += 1) {
    expect(cards[index].top - cards[index - 1].bottom).toBeGreaterThanOrEqual(8);
  }
  expect(cards.every(({ border }) => border === "1px")).toBe(true);
  expect(cards.every(({ shadow }) => shadow !== "none")).toBe(true);
});
```

- [ ] **Step 3: Write the failing mobile signup behavior test**

Replace the existing always-fixed mobile test with:

```js
test("mobile signup enters sticky mode only after its source position leaves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const signup = page.locator(".hero-signup");
  await expect(signup).toHaveCSS("position", "relative");
  await expect(signup).not.toHaveClass(/is-mobile-sticky/);

  await page.locator('[data-story-chapter="connect"]').scrollIntoViewIfNeeded();
  await expect(signup).toHaveClass(/is-mobile-sticky/);
  await expect(signup).toHaveCSS("position", "fixed");

  const clearance = await page.evaluate(() => {
    const signup = document.querySelector(".hero-signup");
    return {
      paddingBottom: parseFloat(getComputedStyle(document.body).paddingBottom),
      signupHeight: signup.getBoundingClientRect().height,
    };
  });
  expect(clearance.paddingBottom).toBeGreaterThanOrEqual(
    clearance.signupHeight + 12,
  );
});
```

- [ ] **Step 4: Run the three tests and verify the expected failures**

Run:

```bash
npx playwright test tests/e2e/landing.spec.js --project=desktop \
  --grep "semantic instead|separate paper|sticky mode" --workers=1
```

Expected: FAIL because `.makeable-wordmark-text`, `.launch-poster`,
`.paper-card`, and conditional sticky behavior do not exist yet.

- [ ] **Step 5: Commit the red tests**

```bash
git add tests/e2e/landing.spec.js
git commit -m "test: define semantic landing rebuild"
```

### Task 2: Rebuild the left conversion rail with semantic UI

**Files:**
- Modify: `index.html`
- Modify: `styles/landing-v2.css`
- Test: `tests/e2e/landing.spec.js`

**Interfaces:**
- Consumes: Makeable font files and token values.
- Produces: `.makeable-wordmark-text`, `.launch-poster`, `.hero-signup-anchor`,
  and the unchanged `[data-google-slot]` authentication mount.

- [ ] **Step 1: Replace raster wordmark and poster markup**

Use:

```html
<a class="makeable-wordmark" href="/" aria-label="Makeable home">
  <span class="makeable-wordmark-text">Makeable</span>
  <img src="/assets/icons/lucide/sparkles.svg" alt="" aria-hidden="true" />
</a>

<div class="launch-poster" aria-label="Early access opens August 9, 2026">
  <span class="launch-poster-kicker">Early access opens</span>
  <strong>August 9,</strong>
  <strong>2026</strong>
</div>
```

Remove `makeable-wordmark-reference.png`, `launch-poster-reference.png`,
`hero-underline-reference.png`, and `hero-rays-reference.png` from the landing
DOM. Style the headline’s final line with a real text decoration and use the
licensed sparkle icon for the nearby accent.

- [ ] **Step 2: Add the reusable paper token layer**

Add root aliases:

```css
:root {
  --landing-paper: var(--makeable-background-paper, #fffdf8);
  --landing-canvas: var(--makeable-background-canvas, #f7f0e4);
  --landing-paper-edge: rgb(111 88 61 / 18%);
  --landing-paper-shadow: var(--makeable-shadow-paper, 0 6px 16px rgb(0 0 0 / 10%));
  --landing-gap: 8px;
}

.paper-card {
  overflow: hidden;
  border: 1px solid var(--landing-paper-edge);
  border-radius: 8px;
  background-color: var(--landing-paper);
  background-image: var(--paper-texture);
  box-shadow: var(--landing-paper-shadow);
}
```

- [ ] **Step 3: Style the semantic poster and wordmark**

Use Makeable fonts and token colors:

```css
.makeable-wordmark-text {
  color: var(--makeable-text-primary, #111);
  font-family: var(--font-display);
  font-size: clamp(34px, calc(var(--landing-rail-width) * 0.074), 45px);
  font-weight: 760;
  letter-spacing: -0.055em;
}

.launch-poster {
  display: grid;
  width: min(100%, 490px);
  padding: 28px 38px 30px;
  background: var(--makeable-step-publish, #ffd43b);
  box-shadow: 7px 8px 0 rgb(244 59 136 / 82%);
  color: var(--makeable-text-primary, #111);
  font-family: var(--font-annotation);
  transform: rotate(-2deg);
}
```

Preserve the existing Google mount and accessible status region.

- [ ] **Step 4: Run semantic, split-layout, typography, and Google tests**

Run:

```bash
npx playwright test tests/e2e/landing.spec.js --project=desktop \
  --grep "semantic instead|public homepage|approved split|mixed type|Google" \
  --workers=1
```

Expected: PASS.

- [ ] **Step 5: Commit the semantic rail**

```bash
git add index.html styles/landing-v2.css tests/e2e/landing.spec.js
git commit -m "feat: rebuild semantic landing rail"
```

### Task 3: Correct the same-photo recognition comparison

**Files:**
- Modify: `index.html`
- Modify: `styles/landing-v2.css`
- Test: `tests/e2e/landing.spec.js`

**Interfaces:**
- Consumes: `.paper-card` and `--comparison-reveal`.
- Produces: one `.comparison-photo`, one
  `[data-comparison-recognition-layer]`, three tight bounds, three adjacent
  annotation pills.

- [ ] **Step 1: Extend the comparison test with geometry**

Add assertions:

```js
const geometry = await comparison.evaluate((root) => {
  const photo = root.querySelector(".comparison-photo").getBoundingClientRect();
  return [...root.querySelectorAll(".part-outline")].map((outline) => {
    const rect = outline.getBoundingClientRect();
    return {
      insidePhoto:
        rect.left >= photo.left - 6 &&
        rect.top >= photo.top - 6 &&
        rect.right <= photo.right + 6 &&
        rect.bottom <= photo.bottom + 6,
      coverage: (rect.width * rect.height) / (photo.width * photo.height),
    };
  });
});
expect(geometry.every(({ insidePhoto }) => insidePhoto)).toBe(true);
expect(geometry.every(({ coverage }) => coverage < 0.18)).toBe(true);
```

Run this test before changing comparison CSS. Expected failure: one or more
existing full-width callouts sit outside the contained photo frame.

- [ ] **Step 2: Make the comparison a paper card with wood fill**

Apply `.paper-card` to the comparison wrapper. Remove the blurred
`comparison-media::before` treatment. Use a stable desk tone:

```css
.comparison-media {
  background-color: #8b6648;
  background-image: url("/assets/landing/desk-wood-fill.jpeg");
  background-position: center;
  background-size: 280px 280px;
}
```

Create `desk-wood-fill.jpeg` from an empty central region of the supplied desk
photo. It contains no product, text, or UI.

- [ ] **Step 3: Place labels beside their targets**

Keep bounds inside `.comparison-annotation-frame`. Place annotation pills in
the same frame and connect them with vendored arrow icons:

```css
.part-callout--display { top: 11%; left: 66%; }
.part-callout--sensor { top: 48%; left: 27%; }
.part-callout--board { top: 76%; left: 51%; }
```

Use these tight dimensions from the actual 1600×1200 photo:

```css
.part-outline--display {
  top: 4%;
  left: 38%;
  width: 25%;
  height: 27%;
  transform: rotate(-8deg);
}
.part-outline--sensor {
  top: 42%;
  left: 0;
  width: 25%;
  height: 30%;
  transform: rotate(-3deg);
}
.part-outline--board {
  top: 42%;
  left: 64%;
  width: 27%;
  height: 49%;
  transform: rotate(-4deg);
}
```

Do not use one detached right-edge label column.

- [ ] **Step 4: Run comparison tests across all projects**

Run:

```bash
npx playwright test tests/e2e/landing.spec.js \
  --grep "workbench comparison|photography|viewport" --workers=1
```

Expected: PASS on desktop, tablet, and mobile.

- [ ] **Step 5: Commit the corrected comparison**

```bash
git add assets/landing/desk-wood-fill.jpeg index.html \
  styles/landing-v2.css tests/e2e/landing.spec.js
git commit -m "fix: align recognition to one desk photo"
```

### Task 4: Rebuild Recognize, Connect, and Test as paper cards

**Files:**
- Create: `assets/landing/recognize-hardware.png`
- Create: `assets/landing/connect-hardware.png`
- Create: `assets/landing/test-hardware.png`
- Modify: `index.html`
- Modify: `styles/landing-v2.css`
- Test: `tests/e2e/landing.spec.js`

**Interfaces:**
- Consumes: `.paper-card`, Makeable stage color tokens, approved hardware
  imagery.
- Produces: three semantic `[data-story-frame]` cards with hardware-only
  images and real stage UI.

- [ ] **Step 1: Add the failing hardware-only and status tests**

Add:

```js
test("process cards use hardware-only assets and coded status UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('[data-story-chapter="recognize"] img.story-image'))
    .toHaveAttribute("src", "/assets/landing/recognize-hardware.png");
  await expect(page.locator('[data-story-chapter="connect"] img.story-image'))
    .toHaveAttribute("src", "/assets/landing/connect-hardware.png");
  await expect(page.locator('[data-story-chapter="test"] img.story-image'))
    .toHaveAttribute("src", "/assets/landing/test-hardware.png");
  await expect(page.locator(".demo-status-row")).toHaveCount(4);
  await expect(page.locator(".demo-progress")).toHaveAttribute("value", "87");
});
```

Run and expect FAIL because the hardware-only assets and coded status UI do not
exist.

- [ ] **Step 2: Extract photography-only assets**

The approved Recognize and Connect assets already contain photography only.
Copy them without recompression. Crop the Test asset to its left 255px so its
existing raster status panel is excluded:

```bash
cp assets/landing/landing-recognize-reference.png \
  assets/landing/recognize-hardware.png
cp assets/landing/landing-connect-reference.png \
  assets/landing/connect-hardware.png
sips --cropToHeightWidth 238 255 --cropOffset 0 0 \
  assets/landing/landing-test-reference.png \
  --out assets/landing/test-hardware.png
```

Open all three final files. Expected: hardware photography and decorative tape
only; no stage title, chip, caption, or status text.

- [ ] **Step 3: Replace stage markup**

Each article receives `paper-card` and contains:

```html
<div class="story-copy">
  <div class="story-banner">
    <span class="story-number">01</span>
    <h2>Recognize</h2>
  </div>
  <p>We found 6 things!</p>
  <ul class="part-chip-list" aria-label="Recognized parts">…</ul>
</div>
<figure class="story-visual">
  <img class="story-image" src="/assets/landing/recognize-hardware.png" alt="…" />
</figure>
```

The Test card additionally contains four `.demo-status-row` elements and:

```html
<progress class="demo-progress" value="87" max="100">87%</progress>
```

- [ ] **Step 4: Style card separation and responsive stacking**

Use:

```css
.story-stage { gap: 8px; }
.story-scene { border: 1px solid var(--landing-paper-edge); }

@media (max-width: 700px) {
  .story-stage { gap: 24px; padding: 24px 20px; }
  .story-scene { grid-template-columns: 1fr; }
  .story-visual { min-height: 220px; }
}
```

- [ ] **Step 5: Run stage content, card, mobile-flow, and accessibility tests**

Run:

```bash
npx playwright test tests/e2e/landing.spec.js --workers=1 \
  --grep "exact approved|process cards|separate paper|normal flow|accessibility"
```

Expected: PASS.

- [ ] **Step 6: Commit the process-card rebuild**

```bash
git add assets/landing/recognize-hardware.png \
  assets/landing/connect-hardware.png assets/landing/test-hardware.png \
  index.html styles/landing-v2.css tests/e2e/landing.spec.js
git commit -m "feat: rebuild semantic process cards"
```

### Task 5: Implement conditional mobile signup

**Files:**
- Modify: `index.html`
- Modify: `landing.js`
- Modify: `styles/landing-v2.css`
- Test: `tests/e2e/landing.spec.js`

**Interfaces:**
- Consumes: `.hero-signup` and `[data-signup-anchor]`.
- Produces: `setupMobileSignup()` and `.is-mobile-sticky`.

- [ ] **Step 1: Add a stable signup anchor**

Wrap the existing signup section:

```html
<div class="hero-signup-anchor" data-signup-anchor>
  <section class="hero-signup" id="join" aria-labelledby="signup-title">…</section>
</div>
```

- [ ] **Step 2: Add the mobile controller**

Call `setupMobileSignup()` during landing setup and implement:

```js
function setupMobileSignup() {
  const anchor = document.querySelector("[data-signup-anchor]");
  const signup = anchor?.querySelector(".hero-signup");
  if (!anchor || !signup || !("IntersectionObserver" in window)) return;

  const mobile = window.matchMedia("(max-width: 700px)");
  const update = (entry) => {
    const shouldStick =
      mobile.matches &&
      !entry.isIntersecting &&
      entry.boundingClientRect.bottom < 0;
    signup.classList.toggle("is-mobile-sticky", shouldStick);
    document.body.classList.toggle("has-mobile-sticky-signup", shouldStick);
  };

  const observer = new IntersectionObserver(([entry]) => update(entry), {
    threshold: 0,
  });
  observer.observe(anchor);
  mobile.addEventListener("change", () => {
    if (!mobile.matches) {
      signup.classList.remove("is-mobile-sticky");
      document.body.classList.remove("has-mobile-sticky-signup");
    }
  });
}
```

- [ ] **Step 3: Replace the always-fixed mobile CSS**

Use:

```css
@media (max-width: 700px) {
  .hero-signup {
    position: relative;
    inset: auto;
    width: 100%;
  }

  .hero-signup.is-mobile-sticky {
    position: fixed;
    z-index: 150;
    right: 12px;
    bottom: 10px;
    left: 12px;
    width: auto;
  }

  body.has-mobile-sticky-signup {
    padding-bottom: 112px;
  }
}
```

- [ ] **Step 4: Run mobile signup and Google tests**

Run:

```bash
npx playwright test tests/e2e/landing.spec.js --workers=1 \
  --grep "sticky mode|Google|mobile story|viewport"
```

Expected: PASS.

- [ ] **Step 5: Commit conditional sticky behavior**

```bash
git add index.html landing.js styles/landing-v2.css tests/e2e/landing.spec.js
git commit -m "fix: make mobile signup sticky after scroll"
```

### Task 6: Visual QA and full verification

**Files:**
- Modify: `design-qa.md`
- Create: `output/product-design-qa/landing-semantic-desktop.png`
- Create: `output/product-design-qa/landing-semantic-mobile.png`
- Create: `output/product-design-qa/landing-semantic-comparison.png`

**Interfaces:**
- Consumes: completed semantic landing page.
- Produces: passed QA record and final preview.

- [ ] **Step 1: Build and run the full landing suite**

Run:

```bash
npm run build
npx playwright test tests/e2e/landing.spec.js --workers=1
```

Expected: build exits 0 and all landing tests pass.

- [ ] **Step 2: Capture desktop and mobile in the selected browser**

Capture `/` at:

- 1536×1024, initial 50% comparison.
- 390×844, initial in-flow signup.
- 390×844 after scrolling past the signup, showing the sticky state.

- [ ] **Step 3: Make a same-state side-by-side comparison**

Place the 1536×1024 implementation beside the supplied 1536×1024 reference.
Inspect:

- Paper boundaries and 8px card gaps.
- Hero and poster typography.
- Comparison crop and annotation positions.
- Stage banner proportions.
- Mobile gutters and sticky CTA clearance.

Fix all P0, P1, and P2 differences and recapture.

- [ ] **Step 4: Update the QA report**

Record the source, implementation captures, issue history, fixes, and test
results in `design-qa.md`. End the report with:

```text
final result: passed
```

- [ ] **Step 5: Run the complete project test suite**

Run:

```bash
npm test
```

Expected: all unit and browser tests pass.

- [ ] **Step 6: Commit final verification artifacts**

```bash
git add design-qa.md tests/e2e/landing.spec.js index.html landing.js \
  styles/landing-v2.css assets/landing/
git commit -m "feat: finish semantic Makeable landing page"
```
