# Interaction and prototype notes

1. Prompt: typing enables `Continue`; example prompts can populate the field.
2. Upload: drag/drop, file picker, and camera entry lead to scanning. Show progress and retain the original photo.
3. CV review: each annotation selects its component row; correction opens a searchable part picker. Continue only after unresolved labels are confirmed.
4. Feasibility branch: `ready` continues to assembly. `missing` supports add-to-cart and alternative projects without losing the original idea.
5. Assembly: next/previous step, completion checkbox, animated wire path, concise “why this connection matters,” and timestamped real-video clip.
6. Load code: detect connected board, compile, upload, and show recoverable errors. Code remains copyable and editable.
7. Automatic test: status rows progress waiting → running → pass/fail. Failure links back to the relevant assembly step.
8. Manual test: present one concrete behavior, allow pass/retry, and store the student’s acknowledgement.
9. Publish: GitHub OAuth, repository-name validation, public/private choice, generated README preview, then success state with repository link.

## Motion

- Torn-paper surfaces enter 220–280ms with 8px upward movement.
- Marker arrows draw in 300–450ms only when revealing a new connection.
- Status checks use a restrained 160ms scale/fade; respect reduced-motion settings.
- Never animate the full layout during safety-critical wiring instructions.
