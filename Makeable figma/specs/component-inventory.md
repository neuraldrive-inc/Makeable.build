# Component inventory

The Figma file contains local variable-bound components for:

- `Button`: Style = Primary / Secondary / Ink; State = Default / Disabled; editable Label property.
- `Step Rail Item`: State = Inactive / Active / Complete; Step = 1–5.
- `Paper Surface`: prompt and instruction container.
- `Upload Area`: photo/camera drop zone.
- `Sticky Note`: concise handwritten explanation.
- `Status Row`: automatic/manual test state.
- `Annotation Label`: CV and wiring callout.
- `Media Card`: generated animation or clipped real-life video.
- `Code Panel`: generated firmware with monospace styling.

Implementation mapping: use these components as visual primitives, then compose route-level screens from `screen-manifest.json`. Preserve the approved desktop images as visual regression references.
