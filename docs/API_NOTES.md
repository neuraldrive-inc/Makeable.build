# API Notes

These are the implementation assumptions used before coding the prototype.

## OpenAI

- Use the Responses API for image understanding and JSON output.
- Image input uses `input_image` with an `image_url`, including data URLs for uploaded browser images.
- Structured output uses `text.format` with `type: "json_schema"`, `strict: true`, and a full JSON schema.
- The prototype calls OpenAI through `POST /api/openai/responses`, a tiny local proxy backed by `OPENAI_API_KEY`.
- Default model choices are set in `.env`: `OPENAI_MODEL=gpt-5.5` for part planning and `OPENAI_REASONING_MODEL=gpt-5.5` for behavior verification.
- `OPENAI_REASONING_EFFORT=high` is the default. Use `xhigh` only when you are comfortable with slower, higher-cost calls.

Docs:

- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/all

## Deepgram

- Live speech-to-text uses `wss://api.deepgram.com/v1/listen`.
- Browser WebSocket connections cannot send arbitrary custom headers, so this prototype uses the documented subprotocol style: `new WebSocket(url, ["token", apiKey])`.
- Audio capture uses `MediaRecorder` with `audio/webm;codecs=opus` when supported.
- For hosted production, replace direct browser key exposure with a temporary token broker.

Docs:

- https://developers.deepgram.com/reference/speech-to-text/listen-streaming
- https://developers.deepgram.com/docs/using-the-sec-websocket-protocol
- https://developers.deepgram.com/docs/encoding

## Web Serial

- Web Serial is used for ESP32 serial logs: `navigator.serial.requestPort()`, `port.open({ baudRate })`, then `TextDecoderStream` over `port.readable`.
- Web Serial requires a secure context. Chrome treats localhost as acceptable for development.
- The UI filters common USB serial adapters: Silicon Labs CP210x, WCH CH340, FTDI, and Espressif native USB.

Docs:

- https://developer.chrome.com/docs/capabilities/serial
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API

## ESP Flashing

- Arduino CLI compiles generated `.ino` sketches through `POST /api/firmware/compile`.
- The app auto-detects Arduino IDE's bundled CLI at `/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli`.
- The default board FQBN is `esp32:esp32:esp32`; override it with `ARDUINO_FQBN`.
- esptool-js flashes the compiled binary images directly from the browser via Web Serial.
- ESP Web Tools is still loaded for manifest-based flashing as an advanced fallback.

Docs:

- https://esphome.github.io/esp-web-tools/
- https://github.com/espressif/esptool-js
- https://espressif.github.io/esptool-js/docs/index.html

## GitHub

- The local server creates repos with `POST /user/repos`.
- It writes files with `PUT /repos/{owner}/{repo}/contents/{path}` and base64-encoded content.
- The server checks for an existing file SHA before updating, because GitHub requires `sha` for updates.

Docs:

- https://docs.github.com/en/rest/repos/repos
- https://docs.github.com/en/rest/repos/contents
