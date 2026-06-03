# CircuitCodex

CircuitCodex is a lightweight browser prototype for an AI-guided hardware and IoT workflow. It accepts a parts photo, transcribes a spoken project idea with Deepgram, asks OpenAI to produce a structured wiring and firmware plan, compiles/flashes ESP32 firmware through the browser, monitors serial logs through Web Serial, captures webcam evidence, and prepares README/GitHub output.

## Run locally

```bash
node server.mjs
```

Open `http://localhost:8787`.

The app is plain HTML, CSS, and JavaScript. The tiny local server only serves static files, reads `.env`, and proxies OpenAI/GitHub requests so those keys do not need to sit in browser code.

## Keys

Add keys to `.env`:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=high
DEEPGRAM_API_KEY=
GITHUB_TOKEN=
GITHUB_OWNER=
ARDUINO_CLI_PATH=/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli
ARDUINO_FQBN=esp32:esp32:esp32
PORT=8787
```

Deepgram is exposed to the browser in this local prototype because browser WebSockets cannot attach arbitrary `Authorization` headers. For a hosted version, replace that with a short-lived token endpoint.

## Current Flow

1. Upload a photo of the laid-out components.
2. Type or record the project idea.
3. Run AI analysis to get part labels, wiring steps, picture-based build steps, diagnostics, firmware, and README text.
4. Compile the generated ESP32 sketch with Arduino CLI.
5. Flash the ESP32 directly from the app with esptool-js and Web Serial.
6. Reconnect serial and monitor logs.
7. Capture webcam evidence and ask AI to verify visible behavior.
8. Publish README and firmware to GitHub.

## Hardware Notes

Web Serial works best in Chrome or Edge on desktop. Localhost is treated as a secure context for development. For production hosting, serve over HTTPS.

The app uses Arduino IDE's bundled `arduino-cli` when present. It compiles generated sketches server-side, returns the flashable `.bin` images to the browser, and flashes them over Web Serial using esptool-js. It flashes the smaller bootloader, partition table, boot app, and application images instead of the padded merged binary so the image does not exceed detected flash size. ESP Web Tools is still included as an advanced fallback for hosted firmware manifests.

## Hosted mode

This repo includes a Netlify configuration for the online app:

- `netlify.toml` publishes the static app and bundles `netlify/functions/api.mjs`.
- The hosted API proxies OpenAI and GitHub requests so secrets stay server-side.
- Long OpenAI guide, firmware, and visual-check jobs run through background Responses API polling so Netlify does not have to hold one silent request open.
- The browser compresses uploaded photos before sending them to the hosted AI endpoint.
- Firmware compilation and direct ESP32 loading still require the local desktop server, because Netlify Functions are serverless and do not include Arduino CLI plus the ESP32 toolchain.

Set these Netlify environment variables for the hosted AI/documentation flow:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=high
GITHUB_TOKEN=
GITHUB_OWNER=
```

Voice input in the browser needs a browser-safe Deepgram token. Use `DEEPGRAM_BROWSER_KEY` for a public or short-lived key. Do not expose your main Deepgram secret unless you intentionally set `ALLOW_BROWSER_DEEPGRAM_KEY=true`.

## Files

- `index.html` - static app shell
- `styles.css` - product UI styling
- `app.js` - browser workflow logic
- `server.mjs` - no-dependency local static server and API proxy
- `docs/API_NOTES.md` - documentation references and implementation notes
