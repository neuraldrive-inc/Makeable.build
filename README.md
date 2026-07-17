# Makeable

Makeable turns a project idea and a photo of real electronics into a guided hardware build. It identifies parts, checks feasibility, walks through one connection at a time, generates and loads firmware, runs safe diagnostics, and packages the finished project for GitHub or ZIP download.

## Product flow

The 11 routed screens map to five visible stages:

1. Describe — enter an idea, attach a sketch, or dictate with Deepgram.
2. Scan Parts — upload, drag and drop, or photograph parts; then correct the detected inventory.
3. Build + Code — review the ready or missing-parts branch, assemble one connection at a time, and load generated firmware.
4. Test — run sequential serial diagnostics and provide camera evidence for the real-world check.
5. Publish — create or update a GitHub repository, download the same five artifacts as a ZIP, and share the result.

Project snapshots and image blobs persist in IndexedDB. Editing an earlier stage invalidates only its dependent downstream state.

## Run locally

Requirements:

- Node.js 20 or later
- Arduino CLI with the ESP32 core for local compilation
- A Chromium-based browser with Web Serial for board flashing

Install and start:

```bash
npm install
npm start
```

Open `http://127.0.0.1:8787/build/new`.

The local server binds only to `127.0.0.1`. Hosted mode supports planning and code generation, but physical compilation and flashing require the local server.

## Environment

Create an untracked `.env` file:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=high

DEEPGRAM_API_KEY=

GITHUB_TOKEN=
GITHUB_OWNER=

PORT=8787
ARDUINO_CLI_PATH=/absolute/path/to/arduino-cli
ARDUINO_FQBN=esp32:esp32:esp32
```

The browser receives capability flags only. OpenAI, Deepgram, and GitHub credentials remain server-side; voice uses a temporary Deepgram token.

## Commands

```bash
npm run build
npm run test:unit
npm run test:browser
npm run test:a11y
```

Browser tests cover desktop `1440×1024`, tablet `834×1194`, and mobile `390×844`.

## Publishing output

GitHub publishing and ZIP export produce the same artifact set:

- `README.md`
- `build-guide/README.md`
- `code/makeable.ino`
- `parts-list/README.md`
- `test-results/README.md`

Publishing uses the server-configured GitHub owner and token. Existing repositories are recovered through a per-project secret stored in the local project snapshot; the server stores only a proof marker.

## Hardware safety

- Disconnect power before changing wiring.
- Confirm the configured FQBN and pin labels before flashing.
- Keep pumps, motors, and other moving parts clear during loading and diagnostics.
- Diagnostic actuator commands are clamped and followed by an unconditional stop command.
- Stop immediately if a component becomes hot or the board repeatedly resets.

## Architecture

The frontend remains framework-free and is split into routing, state, screen rendering, actions, and server-contract modules. The local Node server proxies privileged APIs, runs Arduino CLI, and serves only the explicit public application surface. Licensed icons and the pinned flashing runtime are vendored for offline, reproducible local use.
