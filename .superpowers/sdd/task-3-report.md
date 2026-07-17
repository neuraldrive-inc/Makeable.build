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

## Review-fix addendum

### Findings addressed

1. Annotation layers now use the actual contained-image rectangle calculated from the
   rendered box and intrinsic image dimensions. Wide and tall photos no longer place
   annotations in letterbox space, and the frame recalculates after load and resize.
2. Review selection is persisted as `review.selectedPartId`. Updating that field has
   no downstream invalidation, and the selected inspector restores after direct reload.
3. Rename, bounds, and confidence edits rerender Review from the persisted normalized
   part. Chips, annotation labels, accessible names, clamped dimensions, and the
   confirmation state therefore remain in sync.
4. The existing sketch, upload, and camera labels remain the visible controls. Their
   native file inputs stay in the keyboard order and now project a visible 3px focus
   outline onto the corresponding unchanged label.
5. `diagnostics.requestId` is derived only from the outer OpenAI response `id`.
   Model-produced JSON no longer defines or overrides transport identity.
6. Marking a missing part as obtained incorporates it into confirmed inventory. When
   the final missing part is obtained, local feasibility becomes Ready, the empty
   missing list is removed, generated wiring/firmware are preserved, and routing moves
   to the Ready screen.
7. Photo object URLs use a revision-aware registry. Replacing a photo revokes the old
   URL; page teardown revokes all remaining URLs and disconnects image observers.
8. Playwright now uses a bounded two-worker pool. The fresh aggregate suite exited
   cleanly.

### Review-fix TDD evidence

RED was captured before production changes:

- `node --test tests/unit/task3-actions.test.js tests/unit/state.test.js tests/unit/foundation.test.js`
  - 20 passed, 9 failed
  - Expected failures covered untrusted model request IDs, missing contained-image
    geometry, missing acquisition and URL-lifecycle contracts, runtime-only selection,
    downstream invalidation, and an unbounded worker configuration.
- `npx playwright test tests/e2e/task3.spec.js --project=desktop --workers=1`
  - 2 passed, 4 failed
  - The visible file controls had no focus outline, the annotation layer was
    misregistered by 145.17px on a wide image, and no object URLs were revoked.
- `npx playwright test tests/e2e/task3.spec.js --project=desktop --workers=1 --grep "review selection|final required part"`
  - Both targeted behaviors failed before implementation. The corrected selection
    reproduction then failed because the inspector disappeared after direct reload;
    final acquisition remained on `/build/feasibility/missing`.

GREEN after implementation:

- `node --test tests/unit/task3-actions.test.js tests/unit/state.test.js tests/unit/foundation.test.js`
  - 29 passed
- `npx playwright test tests/e2e/task3.spec.js --project=desktop --project=tablet --project=mobile`
  - 24 passed
- `MAKEABLE_VISUAL=1 npx playwright test tests/e2e/task3.spec.js --project=desktop --workers=1`
  - 8 passed
- `git diff --check && npm run build && npm test`
  - whitespace check passed
  - build passed
  - 43 unit tests passed
  - 48 browser tests passed
  - command exited 0

### Rendered verification and reference comparison

The in-app Browser reloaded the implementation after the fixes and confirmed:

- page identity: `/build/new`, title `Makeable`
- meaningful semantic DOM with no framework error overlay
- the sketch file input receives keyboard focus after Tab
- the unchanged visible “Add a sketch” label shows a solid 3px focus outline
- screenshot geometry remains consistent with the accepted Describe composition

Browser console entries were extension-origin LavaMoat warnings and extension message
channel shutdown messages; no application runtime or framework errors were observed.

All five fresh 1440×1024 renders were compared again to references 01, 02a, 02b, 03a,
and 03b:

- Describe retains the approved headline, single voice subtitle trigger, taped paper
  panel, CTA, and example row.
- Upload retains the heading/privacy note, camera link, central upload panel, and
  three-tip row.
- Review retains its photo-first composition, count note, chips, and confirmation
  action. The only dynamic correction controls still appear after selecting a part.
- Ready retains its photo/annotation context, inventory strip, note, and “Show me how”
  action.
- Missing retains the two-column inventory/need composition and compatible alternative
  area.

No base screen element was added or removed. Existing intentional runtime deviations
remain: uploaded imagery replaces reference illustration art, values and counts are
data-driven, and fabricated prices/checkout controls are omitted.
