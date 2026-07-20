# Vendored Makeable assets

The fonts are the Latin variable-weight WOFF2 builds from Fontsource and retain their individual SIL Open Font License files:

- Fredoka `@fontsource-variable/fredoka@5.2.10`
- Nunito Sans `@fontsource-variable/nunito-sans@5.2.7`
- Shantell Sans `@fontsource-variable/shantell-sans@5.2.7`
- Roboto Mono `@fontsource-variable/roboto-mono@5.2.9`

The Lucide SVG subset under `icons/lucide/` combines the original 16-icon Lucide SVG subset from
`lucide-static@0.468.0` with the eight Makeable v1 instruction/navigation icons
from the official `lucide-static@1.25.0` package. The package license is retained
in the same directory. SVGs are referenced as files so their source and license
remain auditable.

The offline Web Serial loader under `vendor/esptool-js/` is the browser bundle
from the pinned `esptool-js@0.5.7` dependency. Its Apache License 2.0 text is
retained beside the vendored bundle. Makeable imports this local copy so board
loading never depends on a runtime CDN request. The bundle's pako, atob-lite,
and tslib dependency licenses are retained under `vendor/esptool-js/licenses/`.

The three versioned `landing/*-hardware-clean*.png` files are hardware-only photographic
layers produced with the built-in ImageGen editing workflow from the approved
landing references. They intentionally contain no interface text, tape,
arrows, labels, checks, progress, or other baked-in UI; those elements are
rendered semantically by `index.html` and `styles/landing-v2.css`.
