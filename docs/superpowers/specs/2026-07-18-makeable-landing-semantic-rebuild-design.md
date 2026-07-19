# Makeable landing-page semantic rebuild

Date: 2026-07-18  
Status: approved direction, ready for implementation planning

## Goal

Rebuild the public Makeable waitlist page so it reads as one polished workshop
storybook rather than a collage of cropped screenshots. The supplied
1536×1024 landing-page reference remains the visual target. Text, labels,
buttons, paper panels, and launch information will be real semantic UI.
Photography remains photography.

The page has one conversion goal: explain Makeable in seconds and make the
Google waitlist action obvious without obscuring the product story.

## Source of truth

- Landing reference:
  `/var/folders/dv/ktyly2rn0zq2zh4lnn93s4sw0000gn/T/codex-clipboard-0b194d65-90fe-4fdd-9b14-db727f1cb418.png`
- Makeable tokens:
  `Makeable figma/tokens/makeable.css`
- Responsive rules:
  `Makeable figma/specs/responsive.md`
- Current runtime:
  `index.html`, `styles/landing-v2.css`, and `landing.js`

The landing reference controls composition and visual rhythm. The Makeable
handoff controls colors, typography, spacing, accessibility, and responsive
behavior.

## Construction rule

Do not crop UI text, launch information, logos, labels, arrows, status rows, or
colored banners from the reference image.

Build those elements with HTML and CSS using the existing self-hosted Makeable
fonts and design tokens. Use image assets only for:

- Hardware photography.
- Paper texture.
- Licensed iconography.
- Small decorative tape or marker assets when a source asset is available.

No screenshot crop may contain text that is also represented as interface
content.

## Desktop composition

At the 1536×1024 source viewport:

- The left conversion rail occupies approximately 39.6% of the width.
- The right product story occupies approximately 60.4%.
- The left rail remains fixed while the right story scrolls.
- The first viewport contains the desk comparison followed by three separate
  process cards.

The left rail contains:

1. A semantic Makeable wordmark.
2. The three-line headline, “Build the thing in your head.”
3. A short two-line explanation.
4. A coded yellow launch poster reading “Early access opens August 9, 2026.”
5. A coded “Join the waitlist” annotation.
6. The primary Google action.
7. One short reassurance line.

The wordmark, headline, launch poster, and annotations must not use rasterized
text. The headline uses Fredoka, supporting copy uses Nunito Sans, and
annotation copy uses Shantell Sans.

## Paper-surface system

Create one reusable paper-surface treatment for the comparison and process
cards:

- Background: Makeable paper over the existing subtle paper texture.
- Boundary: visible one-pixel warm neutral edge.
- Shadow: `--makeable-shadow-paper`.
- Radius: restrained, between the small and medium Makeable radii.
- Internal padding: based only on the 8px spacing scale.
- Separation: 8px minimum between desktop cards, 24px on mobile.

Every process stage is a distinct paper card. No stage touches or visually
merges into the next stage.

Colored stage banners remain flat torn-paper-inspired blocks, but their number,
title, supporting copy, and chips are real text. The paper boundary—not an
arbitrary shadow or transparent gap—creates the separation.

## Desk comparison

The comparison uses exactly one source image:
`/assets/landing/desk-parts.jpeg`.

The photo never changes position, scale, crop, or identity while dragging.
The slider reveals only a recognition layer over the same pixels.

The comparison surface uses a wood-toned fill derived from the same desk photo
so the contained 4:3 image has no transparent, black, or blurred side gutters.
The full ESP32, PIR sensor, and OLED remain visible.

Recognition annotations:

- Tight bounds follow each product’s visible orientation.
- OLED uses hot pink.
- PIR motion sensor uses Makeable green.
- ESP32 DevKit uses Makeable blue.
- Each label is a compact white annotation pill with a colored dot.
- Each label sits next to its product, not in a detached list at the far edge.
- A short licensed arrow icon connects the label to the product.
- Labels are clipped with the recognition layer and appear only on the
  “Makeable sees” side.

The comparison remains a semantic range input with mouse, touch, and keyboard
support.

## Process cards

### 01 Recognize

- Hot-pink coded banner.
- Real “We found 6 things!” copy.
- Six coded removable-looking part chips.
- Hardware-only image showing the detected inventory.

### 02 Connect

- Periwinkle coded banner.
- Real “We’ll wire it up.” copy.
- Coded pin chips for VCC, GND, and SIG.
- Hardware-only wiring image.

### 03 Test

- Mint/green coded banner.
- Real “We’ll test everything.” copy.
- Hardware-only test setup image.
- Coded status panel with four checks and progress.

The hardware crops will be extracted from the approved visual, but they cannot
include copied headings, labels, chips, or status text. The UI surrounding the
photography must be editable and responsive.

## Waitlist behavior

Desktop:

- The conversion rail stays fixed.
- The Google button remains visually dominant.

Mobile:

- The full waitlist section appears in normal document flow.
- It does not cover the hero, launch poster, or comparison on initial load.
- After the original signup section scrolls above the viewport, the same signup
  section becomes a compact bottom-safe sticky action.
- A layout placeholder preserves document height during the sticky state.
- Returning to the signup position restores the full in-flow section.
- The sticky state leaves sufficient document padding so the final process card
  is never hidden.

The Google authentication and waitlist contract remain unchanged.

## Responsive behavior

### Tablet

- The page stacks into one column below the desktop split threshold.
- The conversion rail becomes a normal top section.
- Paper cards retain two-column copy/image layouts only when both columns remain
  at least 320px.
- Section gaps are 32–48px.

### Mobile

- Target viewport: 390×844.
- Side gutters: 20px.
- Section gaps: 24–32px.
- All paper cards are one column.
- Hardware imagery scales to the card width without distortion.
- Comparison annotations stay attached to the photo and do not cross into
  another card.
- No document-level horizontal overflow.
- Primary actions remain at least 48px tall.

## Accessibility

- One page-level `h1`; sequential `h2` stage headings.
- Visible labels and semantic controls.
- Range input remains keyboard operable.
- Google errors and success states remain live regions.
- Contrast meets WCAG 2.1 AA.
- Focus rings remain visible on every interactive element.
- Reduced-motion users receive no sliding or floating entrance motion.
- Touch targets remain at least 44×44px.

## Acceptance criteria

1. No left-rail or process-card text is embedded inside a screenshot crop.
2. Every process stage has a visible paper boundary and deliberate gap.
3. The top comparison contains one desk photo and one clipped recognition
   layer.
4. Product bounds closely fit the photographed components.
5. Annotation pills sit beside their matching products.
6. The comparison has no transparent, black, or heavily blurred filler region.
7. Mobile signup does not cover content on initial load.
8. Mobile sticky signup appears only after the original signup position leaves
   the viewport.
9. The page has no horizontal overflow at 390, 834, 1280, 1440, or 1536 pixels.
10. Google waitlist success and configuration-error behavior continue working.
11. Desktop and mobile same-state screenshots pass side-by-side design QA.
12. `design-qa.md` ends with `final result: passed`.

## Verification

- Unit or browser tests first for semantic construction, single-photo
  comparison, paper-card separation, and conditional mobile sticky behavior.
- Browser interaction test for mouse/keyboard comparison movement.
- Browser tests for Google waitlist success and configuration errors.
- Axe scan for serious and critical accessibility findings.
- Visual capture at 1536×1024 and 390×844.
- Same-state comparison against the supplied reference.
- Full landing-page regression suite before handoff.
