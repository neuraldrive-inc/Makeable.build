# Makeable landing page and pilot entry design

## Goal

Create a public Makeable homepage that explains the product in five seconds and
converts interested visitors into a low-friction waitlist. Add a separate,
forwardable pilot entry that lets any visitor with the link authenticate with
Google and enter the existing builder.

The landing page must feel like the same product as the approved 11-screen
Makeable builder. The Heka reverse-engineering document contributes only
general design judgment: one strong visual thesis, a product-specific
transformation, deliberate hierarchy, and purposeful motion. It does not
contribute Heka artwork, colors, typography, layout, or motifs.

## Approved acquisition behavior

### Public homepage

- `makeable.build/` is the public marketing and waitlist destination.
- The waitlist has exactly two equivalent entry methods:
  - one-tap Google authentication;
  - one email field and submit action.
- There are no additional profile, organization, role, survey, qualification,
  or onboarding fields.
- Both methods create the same waitlist record and end in the same confirmation
  state.
- Google authentication requests only standard identity scopes.
- The page describes August 8 as the intended early-access launch date without
  presenting an unchangeable year-specific countdown.

### Pilot entry

- `makeable.build/pilot` is a private-link landing state.
- The public homepage does not link to it.
- Any visitor with the URL can continue with Google; there is no allowlist.
- The link may be forwarded intentionally as an organic marketing loop.
- Successful Google authentication sends the visitor to `/build/new`.
- A raw hosting-provider preview URL is not the user-facing pilot URL.

## Visual thesis

**Messy desk to clear build path.**

A hand-drawn hot-pink build line travels through the page and connects the five
existing Makeable stages: Describe, Scan Parts, Build + Code, Test, and Publish.
The line is not decoration alone; it explains the transformation from a loose
idea and photographed electronics to a tested, shareable hardware project.

The page uses the current Makeable visual system:

- warm cream paper canvas;
- torn white paper surfaces;
- coral, hot pink, periwinkle, mint, and lemon stage colors;
- Fredoka display type, Nunito Sans body type, Shantell Sans annotations;
- washi tape, marker underlines, arrows, sparkles, and lightly rotated paper;
- real Makeable product imagery inside editorial paper frames.

It must not use generic SaaS gradients, glass cards, floating metric badges,
dark cyberpunk styling, emoji icons, or Heka-derived sculpture, pixel, glitch,
or typography treatments.

## Information architecture

### Header

- Makeable wordmark.
- Small early-access note.
- `Join the waitlist` anchor action.
- No public pilot navigation.

### Hero

- Product-specific headline: turning the parts on a desk into something real.
- One-sentence explanation: photograph parts, describe the goal, receive a
  wire-by-wire guide, working code, and tests.
- Waitlist paper with Google and email options.
- A Makeable-native "desk to done" product composition using real screenshots
  as product previews, never as the interactive page background.

### Build path

- The five existing product stages appear as one connected workflow rather than
  independent feature cards.
- Each stage uses its builder color and concise outcome-oriented copy.
- The workflow uses selected approved screens to demonstrate the real product.

### Transformation story

- A photo/idea state resolves into annotated parts, connection guidance,
  firmware, testing, and a published project.
- Copy focuses on beginner confidence and completion rather than AI novelty.
- The section avoids invented testimonials or unsupported performance claims.

### Final call to action

- The same two waitlist methods repeat without any new fields.
- Confirmation is immediate and compact.
- Footer contains only essential product/company and accessibility information.

## Interaction behavior

- Header waitlist action scrolls and focuses the first waitlist control.
- Email submission validates a normalized email and posts to `/api/waitlist`.
- Google Identity Services renders the official Google control when
  `GOOGLE_CLIENT_ID` is configured.
- Google credentials are verified server-side before a waitlist or pilot action
  succeeds.
- Missing Google configuration is explained in place; the public email path
  remains usable.
- Duplicate signups return success without revealing whether an email already
  exists.
- Errors are announced through an accessible live region and never erase the
  visitor's email.
- The pilot state never shows the email alternative.

## Data and privacy

- Waitlist records contain normalized email, source (`email` or `google`),
  created timestamp, and Google basic profile fields only when provided by the
  verified token.
- Secrets and raw Google credentials are never written to the client, logs, or
  waitlist record.
- Local development stores signups in an ignored data file.
- Hosted deployments forward validated records to a configured durable
  waitlist webhook; absent durable storage returns an honest configuration
  error rather than a false success.

## Responsive behavior

- Desktop uses an editorial two-column hero and a connected horizontal/diagonal
  build path.
- Tablet keeps the story sequence and stacks only where the product preview
  would become illegible.
- Mobile uses 20px gutters, full-width paper panels, a single-column build path,
  and tap targets at least 44px high.
- The page has no horizontal overflow at 390px.
- Product screenshots remain legible through intentional crops rather than
  shrinking entire desktop screens to unreadable thumbnails.

## Accessibility and motion

- Semantic landmarks, one page-level heading, real form labels, visible focus,
  live status, and sufficient contrast are required.
- The build line draws on entry; paper elements settle into place over
  220–280ms; stage checks use a restrained scale/fade.
- `prefers-reduced-motion` removes drawing and settling animations.
- Google branding follows the official rendered button rather than a handmade
  imitation.

## Acceptance criteria

- `/` renders the public landing page rather than redirecting to `/build/new`.
- `/pilot` renders the forwardable Google-only pilot entry.
- `/build/*` continues to render and guard the existing 11-screen builder.
- Public signup offers only Google or email.
- Pilot access offers only Google.
- Both pages work at 1440×1024, 834×1194, and 390×844 without horizontal
  overflow.
- The email and mocked Google happy paths, error states, keyboard flow, and
  serious/critical accessibility checks have automated coverage.
- The final browser review confirms that the landing page visually belongs to
  the approved Makeable product.
