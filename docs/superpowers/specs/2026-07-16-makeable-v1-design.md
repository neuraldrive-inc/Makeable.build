# Makeable v1 design specification

## Goal

Replace the current GeckCo AI interface with the approved Makeable workshop-storybook interface while preserving and reconnecting the product's existing AI planning, voice input, firmware, Web Serial, camera verification, and GitHub publishing capabilities.

The implementation must reproduce the 11 approved screens in `Makeable figma/final-1440x1024/`, use the supplied design tokens and manifests, support the ready and missing-parts feasibility branches, and adapt the same elements to tablet and mobile without adding or removing user-facing elements.

## Source of truth

Implementation inputs, in descending order of authority:

1. The 11 approved 1440×1024 PNGs in `Makeable figma/final-1440x1024/`.
2. `Makeable figma/specs/screen-manifest.json` for screen identity, order, routes, and branches.
3. `Makeable figma/specs/interactions.md` for control behavior and state transitions.
4. `Makeable figma/specs/responsive.md` for desktop, tablet, and mobile layout behavior.
5. `Makeable figma/tokens/makeable.tokens.json` and `tokens/makeable.css` for color, typography, spacing, radius, and effect values.
6. Existing application behavior in `app.js`, `server.mjs`, and `netlify/functions/api.mjs`.

The Figma file at `https://www.figma.com/design/9venqrASomMyHA6E3OCRUJ` contains foundations and components, but the Starter-plan MCP limit prevents automated inspection and placement of the screen images. The complete local developer handoff therefore remains sufficient and authoritative.

## Brand and visual language

- Rename all user-facing GeckCo AI and Codex For Hardware language to **Makeable**.
- Preserve legacy configuration and local-storage identifiers only where required to migrate existing user settings.
- Use the supplied Fredoka display, Nunito Sans body, Shantell Sans annotation, and Roboto Mono code roles.
- Use the supplied cream paper canvas, torn paper surfaces, washi tape, marker annotations, real hardware imagery, and restrained doodles exactly as represented in the approved screens.
- The interface should feel like a polished workshop storybook: approachable for beginners without becoming childish.
- Do not invent additional cards, menus, navigation elements, decorative motifs, controls, or copy blocks.

## Architecture

The app remains a server-rendered static HTML/CSS/JavaScript application with the existing Node server and API endpoints. The frontend will be reorganized into focused modules rather than extending the current monolithic stage renderer:

- `app.js`: application bootstrap and integration wiring.
- `src/makeable/state.js`: project state, route progression, branch decisions, and persistence boundaries.
- `src/makeable/router.js`: the 11 route definitions, URL synchronization, guarded transitions, and back navigation.
- `src/makeable/render.js`: route-level composition and shared Makeable primitives.
- `src/makeable/actions.js`: upload, camera, OpenAI, Arduino, serial, test, and publish actions.
- `src/makeable/content.js`: screen copy, progress labels, and safe fallback content.
- `styles.css`: global shell and shared styling.
- `styles/makeable.css`: token import, responsive layout, component styling, interaction states, and motion.

Existing server endpoints and request/response contracts remain unchanged unless a failing behavior test demonstrates that an additive field is required.

## Screen flow

### 1. Describe — `/build/new`

- The idea field is the primary control.
- Example prompt cards populate the field.
- The visible “Tell us like you’d tell a friend” subtitle is keyboard-operable and toggles the existing Deepgram voice workflow without introducing another visible control.
- `Start my build` stores the idea and advances to Upload only when a non-empty idea exists.
- `Add a sketch` attaches optional visual context without replacing the parts-photo step.

### 2. Upload parts — `/build/parts/upload`

- Drag/drop and `Upload my parts` use the existing image normalization pipeline.
- `Use camera instead` opens the device camera, captures a still, and feeds the same normalization pipeline.
- The original photo is retained for annotation, assembly, verification, and publishing.
- Successful selection begins AI analysis and advances to Review; recoverable errors remain on this screen.

### 3. Review parts — `/build/parts/review`

- Render AI detections on the user's original image.
- Selecting an annotation selects its matching component chip.
- A component label can be renamed through a searchable part picker.
- Chips can remove false detections; drag adjustment updates stored bounds.
- Unresolved low-confidence labels require confirmation before `Confirm my parts` proceeds.
- Confirming generates or normalizes the guide and firmware, then evaluates feasibility.

### 4a. Feasibility ready — `/build/feasibility/ready`

- Show the detected required components and their roles.
- `Show me how` enters the first assembly instruction.

### 4b. Feasibility missing — `/build/feasibility/missing`

- Show available parts separately from required missing parts.
- `Add` marks a missing item as obtained and reruns local feasibility; it does not create a new commerce integration.
- `Shop missing parts` opens targeted external product searches in new tabs.
- Alternative project actions preserve the inventory photo, replace the idea, and rerun planning.
- When all missing parts are resolved, transition to the ready state.

### 5. Assemble — `/build/assemble`

- Show exactly one wiring step at a time with count, endpoints, pins, wire color, rationale, and quick check.
- Back, numbered progress, and `I connected it` update the current step and completed-step set.
- The media card plays bundled instructional media when available and otherwise plays a restrained step animation using the current wiring image; it must never imply that generated imagery is live camera footage.
- Completing the final step advances to Load Code.

### 6. Load code — `/build/code`

- Show generated firmware in simple and advanced views; preserve edit, copy, and download behavior.
- Detect Arduino CLI/core and connected ESP hardware through the current status and Web Serial flows.
- `Load code to my board` compiles and flashes using the existing server endpoint and esptool-js path.
- Progress, cancellation, port-picker cancellation, compilation failure, upload failure, and recovery guidance are visible within the existing screen elements.
- Successful flashing advances to Automatic Test.

### 7. Automatic test — `/build/test/automatic`

- Run project diagnostics sequentially using serial evidence and the generated diagnostic plan.
- Status rows move through waiting, running, pass, and fail states.
- Failure links return to the relevant assembly step.
- `Stop test` safely closes active serial resources.
- Passing all required checks advances to Manual Test.

### 8. Manual test — `/build/test/manual`

- Present one concrete real-world behavior derived from the project plan.
- Use the existing camera evidence plus recent serial output for AI verification.
- `Yes` stores the user's acknowledgement and verification evidence, then advances to Publish.
- `Not yet` remains on the screen with actionable repair guidance and supports retry.

### 9. Publish — `/build/publish/connect`

- Preserve repository-name validation and public/private selection.
- Preview the generated repository contents and completed project evidence.
- `Connect GitHub & publish` uses the existing server token/owner configuration and repository/content endpoints; the label remains as approved even though v1 uses server configuration rather than OAuth.
- `Download project instead` downloads the README and firmware artifacts locally.
- Successful upload advances to Publish Success.

### 10. Publish success — `/build/publish/success`

- Show the canonical GitHub URL and uploaded artifact checklist.
- `View my GitHub project` opens the repository.
- `Share project` uses the Web Share API with clipboard fallback.
- `Start another build` clears project state while preserving settings and returns to Describe.

## Shared navigation and progression

- The five-step rail is present on every screen and visually matches the active/complete states in the references.
- Subscreens map to their parent step: Describe, Scan, Build + Code, Test, Publish.
- Completed parent steps are marked only after their required child state is satisfied.
- Navigation to later stages is guarded; completed earlier stages remain revisitable without destroying downstream state unless the user changes an upstream input.
- Changing the idea, photo, confirmed parts, wiring plan, or firmware invalidates only the dependent downstream state.
- URLs reflect the current manifest route and restore the farthest valid screen after reload.

## Responsive behavior

- Desktop is validated at 1440×1024 against the approved PNG for each state.
- Tablet is validated at 834×1194 with a compact horizontal progress strip and two-column regions only when each column remains at least 320px.
- Mobile is validated at 390×844 using one column, a sticky compact progress header, 20px gutters, bottom-safe actions, and no horizontal scrolling except inside code.
- Paper surfaces become full width below 720px.
- Annotation callouts remain attached to their targets; when a target stacks, the callout moves beneath it.
- All touch targets are at least 44×44px and primary actions at least 48px high.
- Mobile retains every approved element, reflowing rather than hiding content.

## Motion and accessibility

- Paper surfaces enter over 220–280ms with an 8px upward movement.
- Marker arrows reveal over 300–450ms only for new guidance.
- Status checks use a restrained 160ms scale/fade.
- `prefers-reduced-motion` removes nonessential motion.
- Semantic controls, visible focus, keyboard operation, alt text, live status regions, form labels, and error descriptions are required.
- Safety-critical instructions never animate the full layout.

## Error handling

- Missing idea, unreadable photo, denied camera/microphone permissions, AI failures, low-confidence detections, unavailable Arduino CLI/core, port cancellation, compile/flash errors, serial absence, failed tests, and GitHub configuration/API errors are recoverable in place.
- Errors state what happened and the next user action without replacing the approved screen structure.
- No screen claims hardware success from UI timing alone; automatic checks are based on serial evidence and manual checks on user/camera evidence.

## Testing and verification

- Add automated tests for route guards, branch selection, upstream invalidation, annotation edits, assembly completion, flash-state transitions, automatic/manual test gates, publishing, sharing fallback, and responsive navigation behavior.
- New behavior is developed test-first: each test is observed failing before implementation and passing afterward.
- Run syntax/build checks and the complete automated test suite.
- Use a real browser to exercise the complete happy path, missing-parts branch, recoverable error paths, keyboard navigation, and desktop/tablet/mobile layouts.
- Capture every route at its target viewport and compare it with the corresponding approved reference.
- Save `design-qa.md` in the project root; handoff requires `final result: passed` after all P0/P1/P2 visual issues are fixed.

## Repository and delivery

- All work occurs on branch `makeablev1`, created directly from `main`.
- Track the developer handoff folder needed for implementation; do not commit `.DS_Store` or the redundant ZIP archive.
- Keep `.env` ignored and never expose secrets in client code, logs, commits, screenshots, or test fixtures.
