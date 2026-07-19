# Makeable v1 design QA

## Source truth

- Approved screen references: `Makeable figma/final-1440x1024/*.png`
- Design tokens and responsive specifications: `Makeable figma/tokens/` and `Makeable figma/specs/`
- Implementation screenshots and combined comparisons: `design-qa-evidence/postfix/`

## Viewports checked

- Desktop: 1440 × 1024
- Tablet: 834 × 1194
- Mobile: 390 × 844

All 11 approved routes were captured at all three sizes. The desktop captures were paired side by side with their matching approved references in the `*-comparison.png` files. Focused geometry metrics were also recorded for the missing-parts desktop route because its heading and primary action sit at the top and bottom edges of the approved composition.

## Comparison history

1. Full-route comparisons found no P0 or P1 visual failures. The first desktop pass exposed a P2 clipped heading on `/build/feasibility/missing`; desktop SPA navigation was corrected so the heading now starts at `y: 58px`.
2. The corrected comparison then exposed a P2 primary action below the 1440 × 1024 frame. A desktop-height compaction rule moved `Shop missing parts` to `y: 951px`, fully inside the viewport, without changing tablet or mobile reflow.
3. The final combined comparison shows the complete heading, both inventory columns, alternative-project cards, and primary action. There is no horizontal overflow, broken imagery, or console error.

## Interaction coverage

- Describe idea, example prompts, voice affordance, and sketch attachment
- Drag/drop, file picker, camera capture, compression, and orientation
- Part annotation selection, rename, delete, bounds editing, and confidence confirmation
- Ready and missing-parts feasibility branches, external searches, and alternative projects
- Persisted assembly progress, Back, and numbered step controls
- Firmware views, editing, copy, download, local compile/flash, cancellation, and retry
- Sequential automatic diagnostics, safe Stop Test cleanup, manual evidence, repair, and retry
- Repository validation, public/private selection, GitHub create/update recovery, ZIP export, sharing, and starting another build
- History routing, direct loads, route guards, state invalidation, and responsive progress rail
- Keyboard navigation, focus treatment, live regions, reduced motion, accessible labels, and touch targets

## Runtime and console checks

- Browser test matrix: desktop, tablet, and mobile paths with mocked AI, camera, serial, firmware, and GitHub services
- Visual captures: zero page errors and zero console errors
- Desktop/tablet/mobile: no unintended horizontal document overflow; code is the only intentionally scrollable region
- Final independent implementation review: clean, with no unresolved P0, P1, or P2 findings

## Landing page and pilot entry

- Public landing page checked at 1440 × 1024, 834 × 1194, and 390 × 844.
- Pilot entry checked at the same three viewports.
- Final landing reference:
  `output/product-design-qa/reference.png`.
- Final implementation capture:
  `output/product-design-qa/final-split-top.png`.
- Side-by-side review:
  `output/product-design-qa/compare.html`.
- The desktop page matches the approved split composition: a fixed cream
  conversion rail occupies the left side for the full scroll, while the
  interactive workbench comparison and Recognize, Connect, and Test stages
  scroll vertically on the right.
- The headline, August 9 launch poster, and oversized Google waitlist action
  remain visible at the start, middle, and end of the desktop journey.
- The workbench photo preserves one fixed 4:3 coordinate system. Its
  before/after divider reveals recognition over the exact same pixels without
  resizing or recropping the photo or annotations, and supports mouse, touch,
  and keyboard input.
- Tablet and mobile reflow to a compact sticky conversion row above the same
  vertical story, with exact 20px mobile gutters and no horizontal overflow.
- Public signup and pilot entry are both Google-only. Mocked Google
  verification/redirect, missing Google configuration, focus, live errors,
  reduced motion, and no-overflow behavior are covered.
- Axe found zero serious or critical issues on the landing, post-signup
  success, and pilot states. The post-signup Share action meets the 48px touch
  target and contrast requirements.
- Final landing verification: 63 browser tests passed across desktop, tablet,
  and mobile; the complete 127-test unit suite and build checks also passed.
- The same-view side-by-side comparison found no unresolved P0, P1, or P2
  differences. The intentionally larger right-side stages support the
  requested scrolling product story instead of compressing all three screens
  into one static viewport.

## Accepted intentional deviations

- The approved plan requires hardware truth, so detected ESP32/board names replace illustrative Uno labels.
- User-supplied parts and evidence photos replace fabricated hardware imagery where the flow owns real evidence.
- Licensed Lucide icons are used where the flattened references did not provide reusable source illustrations.
- Missing parts use compatible external searches rather than fake live prices or checkout.
- Publish and Success label an untested source image as `Original parts photo`; `Tested & working` appears only when manual evidence exists.
- Hosted mode remains honest about browser flashing limitations; local Makeable uses Arduino CLI and Web Serial.

final result: passed
