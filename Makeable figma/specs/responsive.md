# Responsive specification

## Frame targets

- Desktop: 1440×1024. Preserve the approved source images exactly.
- Tablet: 834×1194. Collapse the left rail to a compact horizontal step strip; maintain two-column content only when both columns remain at least 320px.
- Mobile: 390×844. Use one column, a sticky compact progress header, 20px side gutters, and bottom-safe primary actions.

## Layout rules

- Desktop content max-width: 1280px; gutters: 64–80px.
- Tablet gutters: 32px; section gaps: 32–48px.
- Mobile gutters: 20px; section gaps: 24–32px.
- Paper cards become full width below 720px.
- Annotation arrows remain attached to their target; if the target stacks, move the annotation beneath it rather than drawing across sections.
- Code and media panels use horizontal scrolling only for code; media always scales to container width.
- Assembly instructions keep the current step above the video example on mobile.
- Missing-parts shop cards form a two-column tablet grid and one-column mobile list.
- Primary CTAs are at least 48px tall and remain visible without covering content.
- All touch targets are at least 44×44px.

## Type scaling

- Hero: 56 desktop, 44 tablet, 36 mobile.
- Title: 32 desktop, 28 tablet, 24 mobile.
- Body remains 16px; supporting text never drops below 13px.
