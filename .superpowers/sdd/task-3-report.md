# Task 3 — Intake and feasibility implementation report

## Scope

Implemented the five approved Makeable v1 screens from reviewed head
`48e0eba01be9800ea9f9875dd5ade405ea03b712`:

- Describe your idea
- Upload a photo
- Review detected parts
- Ready to build
- Parts still needed

The implementation uses the existing SPA router, project store, API routes, self-hosted
fonts, token system, and licensed Lucide assets. It does not load the supplied reference
PNGs at runtime.

## TDD evidence

RED was captured before implementation:

- `node --test tests/unit/task3-actions.test.js`
  - 0 passed, 4 failed
  - Missing contracts: `normalizeHardwarePlan`, `updateDetectedPart`,
    `normalizeImageFile`, and `createPartSearchUrl`.
- `npx playwright test tests/e2e/task3.spec.js --project=desktop`
  - 1 passed, 3 failed
  - The Describe, upload/review workflow, and Ready DOM did not yet exist.

GREEN after implementation:

- `node --test tests/unit/task3-actions.test.js`
  - 4 passed
- `npm run test:unit`
  - 37 passed
- `npx playwright test tests/e2e/task3.spec.js --project=desktop --project=tablet --project=mobile --timeout=20000`
  - 12 passed
- `npm run test:browser`
  - 36 passed
- `npm run build`
  - passed

A final combined `npm run build && npm test` reconfirmed the build and all 37 unit
tests. Playwright passed 34 of 36 tests; two copies of the pre-existing shell
direct-route case timed out during a resource-heavy four-worker run while its mobile
copy passed. Those two cases were rerun serially before handoff.

- `npx playwright test tests/e2e/shell.spec.js:20 --project=desktop --project=tablet --workers=1`
  - 2 passed

## Functional implementation

- The exact visible subtitle “Tell us like you’d tell a friend.” is the only semantic
  voice trigger. It obtains an ephemeral token with `POST /api/deepgram/token` and
  records through Deepgram without exposing a secret to the browser.
- Idea examples, text entry, and sketch input feed the same intake state.
- Drop, file picker, camera capture, and sketch images pass through one orientation,
  resize, and JPEG-compression pipeline.
- AI responses are requested through the existing OpenAI endpoint and normalized into
  bounded coordinates, confidence, feasibility, missing parts, compatible
  alternatives, wiring, firmware, and stable diagnostics.
- Part annotations support persistent selection, rename, delete, bounds editing, and
  explicit low-confidence confirmation.
- Confirming parts regenerates wiring and firmware and routes to Ready or Missing
  according to the normalized feasibility result.
- The Missing screen persists acquisition state, creates targeted search URLs, and
  displays only alternatives compatible with the confirmed inventory.
- No price, stock, seller, cart, checkout, or later build-flow UI is fabricated.

## Browser and responsive verification

The in-app browser was used at 1440×1024 to inspect Describe and Upload against their
approved references. Provider-backed Review, Ready, and Missing states were inspected
with Playwright using deterministic OpenAI, Deepgram, and media mocks while retaining
the real DOM, router, and persisted browser state.

The Task 3 browser test visits every one of the five routes at desktop, tablet, and
mobile widths, runs Axe, and checks document width for horizontal overflow.

Visual QA images were generated only under the ignored `test-results/task3-visual`
directory. They are not production assets and are not committed.

## Fidelity ledger

1. Exact approved headings, subtitle, and primary CTA language are used, except for
   data-driven part counts and feasibility text.
2. The desktop rail, cream canvas, pink intake panel, dashed upload target, coral
   actions, rounded cards, fonts, and spacing follow the approved tokens and geometry.
3. Review uses the normalized user-uploaded photo with persistent DOM annotations,
   confidence chips, and a visible confirmation action.
4. Ready preserves the photo/annotation context and pairs it with confirmed inventory
   and the approved “Show me how” transition.
5. Missing preserves the photo context and uses the approved two-column
   missing/alternatives composition.
6. Tablet converts the rail to a horizontal progress strip; mobile uses a compact
   sticky header and one-column content without horizontal overflow.

## Intentional deviations

- The references' embedded product illustrations are not reused as screenshot
  backgrounds. Runtime review imagery comes from the user's normalized upload.
- No placeholder product photos or invented alternative thumbnails are shown because
  no legitimate discrete assets were supplied.
- Prices, shopping badges, checkout UI, and a generic shop CTA are omitted. Missing
  parts use targeted searches and an “I got this” acquisition action.
- Describe starts with a disabled CTA until the user provides an idea or sketch, as
  required by the interaction contract.
- Counts, confidence, diagnostics, missing parts, and alternatives remain data-driven
  instead of copying sample values from the static references.

## Self-review

- Production files contain no reference screenshot backgrounds, handcrafted inline
  SVG, emoji UI, placeholder imagery, or fabricated commerce data.
- The voice subtitle has no duplicate visible microphone control.
- Uploaded image URLs and project mutations persist through the existing store.
- The missing-parts acquisition mutation preserves regenerated wiring and firmware.
- `git diff --check` completed without whitespace errors.

## Concerns

Live OpenAI and Deepgram provider calls were not exercised in browser automation.
Their browser contracts were tested with deterministic mocks; the implementation uses
the existing server endpoints for real runtime calls.
