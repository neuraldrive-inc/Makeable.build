# Makeable v1 developer handoff

Figma source of truth: https://www.figma.com/design/9venqrASomMyHA6E3OCRUJ

The Figma file contains a tokenized cover/foundations section and a reusable component library. The connected Starter account limited the file to three pages and reached its automation-call cap before the 11 reference images could be placed on the third page, so this package includes every approved source image plus exact screen, responsive, and interaction manifests for direct placement or implementation.

Makeable is a beginner-first hardware builder that turns an idea, a photo of available parts, and a connected controller into a guided, tested, publishable project.

## Visual thesis

A polished workshop storybook: cream paper, torn color blocks, washi tape, bold marker typography, real hardware photography, and simple doodle annotations that make electronics feel approachable without looking childish.

## Screen flow

The handoff-ready exports are normalized to 1440×1024 in `final-1440x1024/`. Earlier generator outputs are not included in this repository copy.

1. `final-1440x1024/01-describe.png` — describe the hardware idea.
2. `final-1440x1024/02a-upload-parts.png` — upload or photograph available components.
3. `final-1440x1024/02b-scan-parts-annotated.png` — review computer-vision labels and corrections.
4. `final-1440x1024/03a-feasibility-ready.png` — success branch when the project is buildable.
5. `final-1440x1024/03b-feasibility-missing.png` — missing-parts shop and build-today alternatives.
6. `final-1440x1024/04-assemble-step.png` — LEGO/IKEA-style connection instruction plus a clipped real-life video.
7. `final-1440x1024/05-load-code.png` — connect the board and load generated code.
8. `final-1440x1024/06a-test-automatic.png` — automatic board, sensor, pump, and power checks.
9. `final-1440x1024/06b-test-your-turn.png` — student-run real-world behavior check.
10. `final-1440x1024/07a-publish-connect.png` — preview the repository and connect GitHub.
11. `final-1440x1024/07b-publish-success.png` — published project confirmation.

## Interaction thesis

- Torn-paper surfaces slide into place as each step becomes active.
- Marker arrows draw themselves to reveal the next connection or action.
- Hardware checks transition from waiting marks to green checks with short, restrained motion.

## Design reference provenance

- tldraw chat template — canvas and AI-chat interaction reference.
- Rough Notation — hand-drawn annotation reference.
- Lucide — icon reference; the licensed runtime subset is vendored at `../assets/icons/lucide/`.

The tldraw and Rough Notation source checkouts used during handoff production are not included here. The generated images use those projects as implementation references only; no repository source code is embedded in the image assets.

## Developer files

- `tokens/makeable.tokens.json` — design-token source.
- `tokens/makeable.css` — implementation-ready CSS custom properties.
- `specs/screen-manifest.json` — all 11 routes, branches, and assets.
- `specs/responsive.md` — desktop/tablet/mobile behavior.
- `specs/interactions.md` — click, upload, scan, build, test, and publish behavior.
- `specs/component-inventory.md` — reusable Figma/component mapping.
- `figma-handoff-state.json` — file URL, node IDs, and build status.
- `foundations-preview.png` and `components-preview.png` — verified Figma previews.
