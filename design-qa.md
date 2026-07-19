# Makeable v1 design QA

## Source truth

- Approved Makeable product screens: `Makeable figma/final-1440x1024/*.png`
- Landing-page reference: `output/product-design-qa/approved-reference.png`
- Landing implementation capture: `output/product-design-qa/landing-desktop-final-candidate.png`
- Combined landing comparison:
  `output/product-design-qa/desktop-comparison.html`
- Design tokens and responsive specifications: `Makeable figma/tokens/` and
  `Makeable figma/specs/`

## Landing-page comparison history

1. The first pass reproduced the split conversion rail and workbench story but
   used a generic wordmark, a star instead of marker rays, a single underline,
   ordinary rounded cards, loose stage spacing, and a 50% comparison divider.
2. Geometry was recalibrated against the approved 1536 × 1024 source. The rail
   is now 608px; the comparison ends at 394px; Recognize, Connect, and Test
   begin at 400px, 596px, and 772px; the reveal begins at 44.3%.
3. The left rail was rebuilt with the exact Makeable lockup, three marker
   strokes, a real double underline, a centered torn launch poster, oversized
   Google CTA, hand underline details, and the approved August 9, 2026 date.
4. The process scenes now use vivid approved pink/blue/green banners, torn
   paper boundaries, six-pixel desktop seams, corrected Connect/Test column
   ratios, and the same hardware crops as the approved source.
5. The final reference and implementation were viewed together at the same
   1536 × 1024 scale. The changed headline copy is intentional:
   `Turn ideas into working physical products in hours.` No unresolved P0, P1,
   or P2 layout, typography, spacing, imagery, paper, or interaction issue
   remains.

## Responsive verification

The same semantic implementation was checked at:

- 1536 × 1024
- 1440 × 1024
- 1024 × 768
- 834 × 1194
- 768 × 1024
- 430 × 932
- 390 × 844
- 360 × 800

Results:

- No horizontal document overflow at any checked size.
- The headline remains exactly three lines with no internal line wrapping.
- Tablet and mobile use one-column flow instead of a squeezed split layout.
- The Google action is at least 98% visible on entry at every checked size.
- At tablet and mobile sizes it becomes a bottom-safe sticky action whenever
  the source CTA is no longer fully visible.
- The before/after slider keeps the photo and annotation frames aligned within
  one pixel at every checked size.
- Mobile keeps 20px gutters, a true 4:3 comparison card, 16px story seams, and
  complete one-column process cards.

## Interaction and accessibility coverage

- One semantic Google waitlist action; no email field or duplicate CTA.
- The configured Google Identity state preserves the same oversized semantic
  CTA and opens Google through the credential prompt instead of replacing it
  with a small third-party iframe button.
- Same-image pointer, touch, and keyboard comparison slider.
- Recognition callouts remain fully visible at the approved 44.3% reveal, and
  real hand-drawn raster arrows replace generic interface arrows.
- Google configuration errors, verified signup success, and pilot redirect.
- Tablet/mobile sticky CTA behavior and safe bottom clearance.
- Focus treatment, live status messaging, reduced motion, labels, and touch
  targets.
- Axe reports zero serious or critical violations on landing and pilot pages.

## Product-flow coverage

- Describe, example prompts, voice affordance, and sketch attachment.
- File, drag/drop, and camera part capture.
- Part correction and both feasibility branches.
- Assembly, firmware editing, compile/flash, diagnostics, and manual testing.
- GitHub publish, recovery, ZIP export, share, and Start Another Build.
- History routing, direct loads, route guards, persistence, and invalidation.

## Verification results

- Build checks: passed.
- Unit suite: 127 passed.
- Complete browser, interaction, responsive, and accessibility suite: 189 passed.
- Final browser console review: no landing-page errors.
- Final combined reference review: passed.

## Accepted intentional deviations

- The landing headline uses the user-approved product statement instead of the
  earlier mockup copy.
- Real detected ESP32/board names replace illustrative Makeable Uno labels.
- User-supplied evidence replaces fabricated hardware imagery where the build
  flow owns real evidence.
- Hosted mode remains honest about browser flashing limitations; local
  Makeable uses Arduino CLI and Web Serial.

final result: passed
