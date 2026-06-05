# GeckCo AI

## Codex For Hardware

**GeckCo AI** is an AI hardware-building buddy that turns messy IoT prototyping into a fun, LEGO-like experience.

Building with ESP32s can feel scary when you are new: sensors, wires, pin diagrams, Arduino setup, firmware, flashing, terminal logs, and debugging all show up at once. GeckCo AI turns that chaos into a friendly step-by-step build guide using your own parts photo.

Upload a photo. Say what you want to build. Let GeckCo guide the rest. 🧩⚡

![GeckCo AI upload photo and describe project idea](images/step%201%20-%20upload%20pic%20and%20speak%20your%20idea.jpg)

---

## The Big Idea 💡

Instead of making beginners jump between wiring diagrams, Arduino IDE, random tutorials, and serial monitors, GeckCo AI keeps the whole hardware journey in one place.

It can:

- 📸 Look at your real parts photo
- 🧠 Identify only the components your project needs
- 🏷️ Label the useful parts directly on the image
- 🔌 Walk you through the wiring one move at a time
- 💻 Generate ESP32 firmware for your idea
- 🚀 Flash the code into the board without touching Arduino IDE
- 👀 Debug the real build using terminal logs and webcam evidence
- 📚 Package the final project into GitHub documentation

---

## Why We Built It 🛠️

Tiny hardware mistakes can break the whole project.

Wrong pin? Nothing works.

Missing ground? Mystery bug.

Bad code upload? More confusion.

Serial log error? Time to panic-scroll forums.

GeckCo AI is designed to feel like a calm friend beside you saying:

> “No worries. Pick up this wire. Put it here. I’ll check the next part with you.”

That is the heart of **Codex For Hardware**.

---

## Visual Proof: The Build Journey 🧪

### 1. Start With What You Have 📸

Lay out your parts, upload one clear photo, then type or speak the thing you want to make.

In this demo, the user wants a motion-triggered light build.

![Step 1 upload photo and speak your idea](images/step%201%20-%20upload%20pic%20and%20speak%20your%20idea.jpg)

### 2. AI Finds the Useful Parts 🧠

GeckCo AI reads the photo and focuses on the parts needed for the project. Extra parts are ignored so the screen does not become label soup.

![AI labels the needed hardware parts](images/step%202%20-%20image%201.jpg)

### 3. One Connection at a Time 🔌

The guide does not dump every wire on you at once. It highlights the current move, shows the exact parts on your own photo, and keeps the instruction simple.

![GeckCo AI shows one wiring move at a time](images/step%202%20-%20image%202.jpg)

### 4. A Clean Final Guide ✅

Each step is built around the photo, the selected parts, and a clear action. It feels closer to LEGO instructions than a scary circuit diagram.

![Final guided wiring image](images/step%202%20-%20final%20image.jpg)

### 5. Pick the Board Settings ⚙️

GeckCo AI keeps the board setup visible so users can confirm the ESP32 target before flashing.

![Selected ESP32 board settings](images/flashing%20selected%20board.jpg)

### 6. Flash the Code Into the Board 🚀

The app generates firmware and loads it directly into the ESP32. No Arduino IDE adventure required.

![Flashing code into the ESP32 board](images/flashing%20loading%20code%20into%20board.jpg)

### 7. Closed-Loop Debugging 👀⚡

After flashing, GeckCo AI can check terminal logs and webcam footage to confirm the physical project is actually doing what it should.

![Closed loop debugging with terminal logs and webcam](images/closed%20loop%20debugging%20system%20with%20terminal%20logs%20and%20webcam.jpg)

### 8. One-Click GitHub Documentation 📚

When the build works, GeckCo AI packages the project into GitHub-friendly documentation so it is easy to save, share, and show off.

![One button upload project to GitHub](images/one%20button%20click%20upload%20project%20to%20github.jpg)

---

## What Makes It Different ✨

| Old Hardware Workflow 😵 | GeckCo AI Workflow ✨ |
| --- | --- |
| Search for wiring diagrams | Upload your own parts photo |
| Guess which parts matter | AI marks only the needed parts |
| Read a giant pinout chart | Follow one small move at a time |
| Copy random Arduino code | Generate firmware for your exact idea |
| Manually compile and flash | Load code directly into the ESP32 |
| Debug alone with serial logs | AI checks logs + webcam evidence |
| Write docs after everything | One-click GitHub documentation |

---

## Core Features 🌟

### 📷 Photo-Based Part Detection

GeckCo AI uses the user’s real photo as the source of truth. The guide is not generic. It points to the actual objects on the table.

### 🪜 Step-by-Step Wiring

The guide shows one connection at a time so beginners can move slowly and confidently.

### 💻 Firmware Generation

The app generates ESP32-ready code based on the project goal and detected components.

### 🔌 Direct Flashing

With Arduino CLI and Web Serial support, GeckCo AI can compile and flash firmware without forcing the user into Arduino IDE.

### 👀 Closed-Loop Debugging

The app can inspect serial logs and webcam evidence, then explain whether the physical build is behaving correctly.

### 📚 GitHub Export

The final project can be packaged into a shareable README and uploaded to GitHub.

---

## Tech Stack 🧰

- **Frontend:** HTML, CSS, JavaScript
- **AI planning:** OpenAI Responses API
- **Voice input:** Deepgram browser transcription
- **Firmware compile:** Arduino CLI
- **Board flashing:** Web Serial + ESP flashing flow
- **Debugging:** Serial logs + webcam evidence
- **Publishing:** GitHub API
- **Hosting-ready flow:** Netlify Functions for server-side API proxying

---

## Run Locally 🏃

```bash
npm install
node server.mjs
```

Then open:

```text
http://127.0.0.1:8787
```

Chrome or Edge is recommended because Web Serial support is needed for board flashing.

---

## Environment Setup 🔐

Create a `.env` file:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=high

DEEPGRAM_API_KEY=

GITHUB_TOKEN=
GITHUB_OWNER=

ARDUINO_CLI_PATH=C:\Program Files\Arduino CLI\arduino-cli.exe
ARDUINO_FQBN=esp32:esp32:esp32

PORT=8787
```

For ESP32 builds, make sure Arduino CLI is installed and the ESP32 board core is available.

---

## Beginner Safety Notes 🧯

- Power the board by USB first.
- Always connect ground before trusting signal wires.
- Double-check the board pin labels before flashing.
- Disconnect power before changing messy wiring.
- If something gets hot, stop immediately.

Hardware should feel fun, not frightening. ⚡

---

## Project Vision 🌈

GeckCo AI is not just a code generator.

It is a hardware companion that watches the whole loop:

```text
parts photo → AI guide → wiring steps → firmware → flashing → real-world check → GitHub docs
```

The dream is simple:

> Anyone should be able to build useful electronics without feeling lost in the wires.

---

## Name

**GeckCo AI**<br>
**Tagline:** Codex For Hardware

Small tool. Big hardware confidence. ⚡
