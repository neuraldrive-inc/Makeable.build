const $ = (selector) => document.querySelector(selector);

let serverConfig = window.CIRCUIT_CODEX_CONFIG || {};
let localOverrides = readLocalOverrides();
const FRONTIER_MODEL = "gpt-5.5";
const LEGACY_MODEL_DEFAULTS = new Set(["gpt-5.4-mini"]);
const WORKFLOW_STAGES = [
  {
    hash: "#capture",
    label: "Step 1: Start",
    hint: "Choose a photo and tell me what you want to make.",
  },
  {
    hash: "#plan",
    label: "Step 2: Guide",
    hint: "Build from your own photo, one connection at a time.",
  },
  {
    hash: "#flash",
    label: "Step 3: Load",
    hint: "I’ll prepare the code and place it on your board.",
  },
  {
    hash: "#verify",
    label: "Step 4: Watch",
    hint: "We’ll listen to the board and check what it is doing.",
  },
  {
    hash: "#document",
    label: "Step 5: Share",
    hint: "Turn the finished build into notes and code you can keep.",
  },
];

const settings = {
  deepgramApiKey: localOverrides.deepgramApiKey || serverConfig.deepgramApiKey || "",
  githubOwner: localOverrides.githubOwner || serverConfig.githubOwner || "",
  openaiModel: pickModel(localOverrides.openaiModel, serverConfig.openaiModel, FRONTIER_MODEL),
  openaiReasoningModel:
    pickModel(localOverrides.openaiReasoningModel, serverConfig.openaiReasoningModel, FRONTIER_MODEL),
  openaiReasoningEffort:
    localOverrides.openaiReasoningEffort || serverConfig.openaiReasoningEffort || "high",
  arduinoFqbn: localOverrides.arduinoFqbn || serverConfig.arduinoFqbn || "esp32:esp32:esp32",
};

const state = {
  imageDataUrl: "",
  imageElement: null,
  imageFit: null,
  plan: null,
  finalTranscript: "",
  interimTranscript: "",
  serialPort: null,
  serialReader: null,
  serialReadableClosed: null,
  serialLog: "",
  deepgramSocket: null,
  voiceRecorder: null,
  voiceStream: null,
  cameraStream: null,
  evidencePhotos: [],
  readme: "",
  compiledFirmware: null,
  activeBuildStepIndex: 0,
  activeWorkflowStageIndex: 0,
};

const els = {
  canvas: $("#partsCanvas"),
  photoInput: $("#partsPhotoInput"),
  clearPhotoButton: $("#clearPhotoButton"),
  ideaText: $("#ideaText"),
  startVoiceButton: $("#startVoiceButton"),
  stopVoiceButton: $("#stopVoiceButton"),
  voiceStatus: $("#voiceStatus"),
  transcriptBox: $("#transcriptBox"),
  analyzeButton: $("#analyzeButton"),
  workflowStages: document.querySelectorAll("[data-stage-index]"),
  timelineButtons: document.querySelectorAll("[data-workflow-stage]"),
  stageBackButton: $("#stageBackButton"),
  stageNextButton: $("#stageNextButton"),
  stageControlTitle: $("#stageControlTitle"),
  stageControlHint: $("#stageControlHint"),
  partsList: $("#partsList"),
  wiringList: $("#wiringList"),
  diagnosticsList: $("#diagnosticsList"),
  visualStepList: $("#visualStepList"),
  buildStepCounter: $("#buildStepCounter"),
  buildStepDots: $("#buildStepDots"),
  prevBuildStepButton: $("#prevBuildStepButton"),
  nextBuildStepButton: $("#nextBuildStepButton"),
  firmwareOutput: $("#firmwareOutput"),
  copyFirmwareButton: $("#copyFirmwareButton"),
  downloadFirmwareButton: $("#downloadFirmwareButton"),
  baudRateInput: $("#baudRateInput"),
  connectSerialButton: $("#connectSerialButton"),
  disconnectSerialButton: $("#disconnectSerialButton"),
  serialCommandInput: $("#serialCommandInput"),
  sendSerialButton: $("#sendSerialButton"),
  evaluateLogsButton: $("#evaluateLogsButton"),
  serialLog: $("#serialLog"),
  logEvaluation: $("#logEvaluation"),
  cameraPreview: $("#cameraPreview"),
  startCameraButton: $("#startCameraButton"),
  captureEvidenceButton: $("#captureEvidenceButton"),
  verifyBehaviorButton: $("#verifyBehaviorButton"),
  evidenceStrip: $("#evidenceStrip"),
  behaviorEvaluation: $("#behaviorEvaluation"),
  manifestUrlInput: $("#manifestUrlInput"),
  loadManifestButton: $("#loadManifestButton"),
  espInstallButton: $("#espInstallButton"),
  boardFqbnInput: $("#boardFqbnInput"),
  eraseFlashInput: $("#eraseFlashInput"),
  refreshArduinoStatusButton: $("#refreshArduinoStatusButton"),
  compileFlashButton: $("#compileFlashButton"),
  flashProgressBar: $("#flashProgressBar"),
  arduinoStatus: $("#arduinoStatus"),
  generateReadmeButton: $("#generateReadmeButton"),
  downloadReadmeButton: $("#downloadReadmeButton"),
  repoNameInput: $("#repoNameInput"),
  privateRepoInput: $("#privateRepoInput"),
  publishGithubButton: $("#publishGithubButton"),
  githubStatus: $("#githubStatus"),
  readmePreview: $("#readmePreview"),
  settingsButton: $("#settingsButton"),
  settingsDialog: $("#settingsDialog"),
  deepgramKeyInput: $("#deepgramKeyInput"),
  githubOwnerInput: $("#githubOwnerInput"),
  openaiModelInput: $("#openaiModelInput"),
  openaiReasoningModelInput: $("#openaiReasoningModelInput"),
  settingsStatus: $("#settingsStatus"),
  saveSettingsButton: $("#saveSettingsButton"),
  clearSettingsButton: $("#clearSettingsButton"),
};

const hardwarePlanSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectTitle: { type: "string" },
    summary: { type: "string" },
    parts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string" },
          confidence: { type: "number" },
          role: { type: "string" },
          bbox: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["x", "y", "width", "height"],
          },
        },
        required: ["id", "name", "type", "confidence", "role", "bbox"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    wiringSteps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          order: { type: "integer" },
          title: { type: "string" },
          instruction: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          fromPartId: { type: "string" },
          toPartId: { type: "string" },
          pin: { type: "string" },
          wireColor: { type: "string" },
          check: { type: "string" },
        },
        required: ["order", "title", "instruction", "from", "to", "fromPartId", "toPartId", "pin", "wireColor", "check"],
      },
    },
    diagnosticTests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          purpose: { type: "string" },
          userAction: { type: "string" },
          expectedSerial: { type: "string" },
        },
        required: ["name", "purpose", "userAction", "expectedSerial"],
      },
    },
    firmwareSpec: {
      type: "object",
      additionalProperties: false,
      properties: {
        board: { type: "string" },
        behavior: { type: "string" },
        libraries: { type: "array", items: { type: "string" } },
        pinAssignments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              gpio: { type: "integer" },
              mode: { type: "string" },
              purpose: { type: "string" },
            },
            required: ["label", "gpio", "mode", "purpose"],
          },
        },
        serialProtocol: { type: "array", items: { type: "string" } },
      },
      required: ["board", "behavior", "libraries", "pinAssignments", "serialProtocol"],
    },
  },
  required: [
    "projectTitle",
    "summary",
    "parts",
    "warnings",
    "wiringSteps",
    "diagnosticTests",
    "firmwareSpec",
  ],
};

const firmwareSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    language: { type: "string" },
    sketch: { type: "string" },
    notes: { type: "string" },
  },
  required: ["language", "sketch", "notes"],
};

const behaviorSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["pass", "needs_attention", "fail", "uncertain"] },
    observations: { type: "array", items: { type: "string" } },
    nextStep: { type: "string" },
  },
  required: ["status", "observations", "nextStep"],
};

bindEvents();
renderSettings();
renderEmptyPlan();
setActiveWorkflowStage(0, { updateHash: true, replace: true });
drawPartsCanvas();
refreshServerConfig();
refreshArduinoStatus();
window.addEventListener("resize", () => {
  drawPartsCanvas();
  renderVisualSteps();
});

function bindEvents() {
  els.photoInput.addEventListener("change", handlePhotoUpload);
  els.clearPhotoButton.addEventListener("click", clearPhoto);
  els.startVoiceButton.addEventListener("click", startVoiceCapture);
  els.stopVoiceButton.addEventListener("click", stopVoiceCapture);
  els.analyzeButton.addEventListener("click", analyzeHardware);
  els.timelineButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveWorkflowStage(Number(button.dataset.workflowStage || 0)));
  });
  els.stageBackButton.addEventListener("click", () => setActiveWorkflowStage(state.activeWorkflowStageIndex - 1));
  els.stageNextButton.addEventListener("click", () => setActiveWorkflowStage(state.activeWorkflowStageIndex + 1));
  els.prevBuildStepButton.addEventListener("click", () => setActiveBuildStep(state.activeBuildStepIndex - 1));
  els.nextBuildStepButton.addEventListener("click", () => setActiveBuildStep(state.activeBuildStepIndex + 1));
  els.copyFirmwareButton.addEventListener("click", copyFirmware);
  els.downloadFirmwareButton.addEventListener("click", downloadFirmware);
  els.connectSerialButton.addEventListener("click", connectSerial);
  els.disconnectSerialButton.addEventListener("click", disconnectSerial);
  els.sendSerialButton.addEventListener("click", sendSerialCommand);
  els.evaluateLogsButton.addEventListener("click", evaluateSerialLogs);
  els.startCameraButton.addEventListener("click", startCamera);
  els.captureEvidenceButton.addEventListener("click", captureEvidence);
  els.verifyBehaviorButton.addEventListener("click", verifyBehavior);
  els.loadManifestButton.addEventListener("click", loadEspManifest);
  els.refreshArduinoStatusButton.addEventListener("click", refreshArduinoStatus);
  els.compileFlashButton.addEventListener("click", compileAndFlashFirmware);
  els.generateReadmeButton.addEventListener("click", () => {
    state.readme = buildReadme();
    els.readmePreview.textContent = state.readme;
  });
  els.downloadReadmeButton.addEventListener("click", downloadReadme);
  els.publishGithubButton.addEventListener("click", publishToGitHub);
  els.settingsButton.addEventListener("click", () => els.settingsDialog.showModal());
  els.saveSettingsButton.addEventListener("click", saveSettings);
  els.clearSettingsButton.addEventListener("click", clearLocalOverrides);
}

function setActiveWorkflowStage(index, options = {}) {
  const activeIndex = clamp(index, 0, WORKFLOW_STAGES.length - 1);
  state.activeWorkflowStageIndex = activeIndex;
  document.body.dataset.stage = String(activeIndex + 1);

  els.workflowStages.forEach((stage) => {
    const stageIndex = Number(stage.dataset.stageIndex || 0);
    const isActive = stageIndex === activeIndex;
    stage.hidden = !isActive;
    stage.classList.toggle("is-active", isActive);
  });

  els.timelineButtons.forEach((button) => {
    const buttonIndex = Number(button.dataset.workflowStage || 0);
    button.classList.toggle("is-active", buttonIndex === activeIndex);
    button.classList.toggle("is-complete", buttonIndex < activeIndex);
  });

  const stage = WORKFLOW_STAGES[activeIndex];
  els.stageControlTitle.textContent = stage.label;
  els.stageControlHint.textContent = stage.hint;
  els.stageBackButton.disabled = activeIndex === 0;
  els.stageNextButton.disabled = activeIndex === WORKFLOW_STAGES.length - 1;
  els.stageNextButton.textContent = activeIndex === WORKFLOW_STAGES.length - 1 ? "All set" : "Continue";

  if (options.updateHash !== false) {
    const url = `${window.location.pathname}${stage.hash}`;
    window.history.replaceState(null, "", url);
  }

  requestAnimationFrame(() => {
    drawPartsCanvas();
    renderVisualSteps();
  });
}

function readLocalOverrides() {
  try {
    return JSON.parse(localStorage.getItem("circuitcodex.settings") || "{}");
  } catch {
    return {};
  }
}

function pickModel(localValue, serverValue, fallback) {
  if (localValue && !LEGACY_MODEL_DEFAULTS.has(localValue)) return localValue;
  if (serverValue && !LEGACY_MODEL_DEFAULTS.has(serverValue)) return serverValue;
  return fallback;
}

async function refreshServerConfig() {
  try {
    const freshConfig = await apiJson("/api/config");
    serverConfig = freshConfig;
    if (!localOverrides.deepgramApiKey) settings.deepgramApiKey = freshConfig.deepgramApiKey || "";
    if (!localOverrides.githubOwner) settings.githubOwner = freshConfig.githubOwner || "";
    if (!localOverrides.openaiModel || LEGACY_MODEL_DEFAULTS.has(localOverrides.openaiModel)) {
      settings.openaiModel = pickModel("", freshConfig.openaiModel, FRONTIER_MODEL);
    }
    if (
      !localOverrides.openaiReasoningModel ||
      LEGACY_MODEL_DEFAULTS.has(localOverrides.openaiReasoningModel)
    ) {
      settings.openaiReasoningModel = pickModel("", freshConfig.openaiReasoningModel, FRONTIER_MODEL);
    }
    if (!localOverrides.openaiReasoningEffort) {
      settings.openaiReasoningEffort = freshConfig.openaiReasoningEffort || "high";
    }
    if (!localOverrides.arduinoFqbn) {
      settings.arduinoFqbn = freshConfig.arduinoFqbn || "esp32:esp32:esp32";
    }
    renderSettings();
    if (els.boardFqbnInput && !els.boardFqbnInput.value) els.boardFqbnInput.value = settings.arduinoFqbn;
    return freshConfig;
  } catch (error) {
    console.error(error);
    return serverConfig;
  }
}

function saveSettings(event) {
  event.preventDefault();
  settings.deepgramApiKey = els.deepgramKeyInput.value.trim();
  settings.githubOwner = els.githubOwnerInput.value.trim();
  settings.openaiModel = els.openaiModelInput.value.trim() || FRONTIER_MODEL;
  settings.openaiReasoningModel = els.openaiReasoningModelInput.value.trim() || FRONTIER_MODEL;
  settings.arduinoFqbn = els.boardFqbnInput.value.trim() || "esp32:esp32:esp32";
  localStorage.setItem("circuitcodex.settings", JSON.stringify(settings));
  localOverrides = { ...settings };
  renderSettings();
  els.settingsDialog.close();
}

function clearLocalOverrides() {
  localStorage.removeItem("circuitcodex.settings");
  localOverrides = {};
  settings.deepgramApiKey = serverConfig.deepgramApiKey || "";
  settings.githubOwner = serverConfig.githubOwner || "";
  settings.openaiModel = pickModel("", serverConfig.openaiModel, FRONTIER_MODEL);
  settings.openaiReasoningModel = pickModel("", serverConfig.openaiReasoningModel, FRONTIER_MODEL);
  settings.openaiReasoningEffort = serverConfig.openaiReasoningEffort || "high";
  settings.arduinoFqbn = serverConfig.arduinoFqbn || "esp32:esp32:esp32";
  els.boardFqbnInput.value = settings.arduinoFqbn;
  renderSettings();
}

function renderSettings() {
  els.deepgramKeyInput.value = settings.deepgramApiKey;
  els.githubOwnerInput.value = settings.githubOwner;
  els.openaiModelInput.value = settings.openaiModel;
  els.openaiReasoningModelInput.value = settings.openaiReasoningModel;
  els.boardFqbnInput.value = settings.arduinoFqbn;
  els.settingsStatus.innerHTML = [
    statusLine("OpenAI server key", serverConfig.hasOpenAIKey),
    statusLine("Deepgram browser key", Boolean(settings.deepgramApiKey)),
    statusLine("GitHub server token", serverConfig.hasGithubToken),
    statusLine("Arduino CLI", serverConfig.hasArduinoCli),
  ].join("");
}

function statusLine(label, ok) {
  return `<div><strong class="${ok ? "ok" : "warn"}">${ok ? "Loaded" : "Missing"}</strong> ${escapeHtml(label)}</div>`;
}

function handlePhotoUpload(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  state.plan = null;
  state.compiledFirmware = null;
  state.activeBuildStepIndex = 0;
  renderEmptyPlan();
  setStatus(els.transcriptBox, "Loading your photo...", "warn");

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.imageDataUrl = resizePhotoForAi(img);
      const displayImg = new Image();
      displayImg.onload = () => {
        state.imageElement = displayImg;
        drawPartsCanvas();
        setStatus(els.transcriptBox, `Photo ready. Now tell me what you want this project to do.`, "ok");
      };
      displayImg.onerror = () => setStatus(els.transcriptBox, "I couldn’t prepare that image. Try another photo.", "danger");
      displayImg.src = state.imageDataUrl;
    };
    img.onerror = () => setStatus(els.transcriptBox, "I couldn’t read that image. Try a clear JPG or PNG.", "danger");
    img.src = String(reader.result || "");
  };
  reader.onerror = () => setStatus(els.transcriptBox, "I couldn’t load that photo. Try choosing it again.", "danger");
  reader.readAsDataURL(file);
}

function resizePhotoForAi(img) {
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / img.naturalWidth, maxSide / img.naturalHeight);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function clearPhoto() {
  state.imageDataUrl = "";
  state.imageElement = null;
  state.imageFit = null;
  state.plan = null;
  state.compiledFirmware = null;
  state.activeBuildStepIndex = 0;
  els.photoInput.value = "";
  renderEmptyPlan();
  drawPartsCanvas();
}

function drawPartsCanvas() {
  const canvas = els.canvas;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width || 900);
  const height = Math.max(220, rect.height || 520);
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  if (!state.imageElement) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
    ctx.font = "800 20px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Choose one clear photo of your parts", width / 2, height / 2 - 8);
    ctx.font = "600 14px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.48)";
    ctx.fillText("Leave a little space between each piece", width / 2, height / 2 + 22);
    return;
  }

  const img = state.imageElement;
  const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
  const drawWidth = img.naturalWidth * scale;
  const drawHeight = img.naturalHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  state.imageFit = { x, y, width: drawWidth, height: drawHeight };
  ctx.drawImage(img, x, y, drawWidth, drawHeight);

  if (state.plan?.parts?.length) {
    drawAnnotations(ctx, state.plan.parts);
  }
}

function drawGrid(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.075)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAnnotations(ctx, parts) {
  const fit = state.imageFit;
  if (!fit) return;
  const colors = ["#ffffff", "#8b5cf6", "#d4d4d8", "#a1a1aa", "#f5f5f5", "#71717a"];

  parts.forEach((part, index) => {
    const bbox = normalizeBbox(part.bbox, index, parts.length);
    const color = colors[index % colors.length];
    const x = fit.x + (bbox.x / 100) * fit.width;
    const y = fit.y + (bbox.y / 100) * fit.height;
    const w = (bbox.width / 100) * fit.width;
    const h = (bbox.height / 100) * fit.height;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowColor = color;
    ctx.shadowBlur = color === "#ffffff" ? 12 : 18;

    const label = `${index + 1}. ${part.name}`;
    ctx.font = "800 13px Inter, system-ui, sans-serif";
    const labelWidth = Math.min(ctx.measureText(label).width + 18, fit.width - 12);
    const labelHeight = 28;
    const labelX = Math.max(fit.x + 6, Math.min(x, fit.x + fit.width - labelWidth - 6));
    const labelY = Math.max(fit.y + 6, y - labelHeight - 6);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color === "#ffffff" || color === "#e5e7eb" ? "rgba(255,255,255,0.92)" : color;
    ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
    ctx.fillStyle = color === "#ffffff" || color === "#e5e7eb" ? "#050507" : "#fff";
    ctx.fillText(label, labelX + 9, labelY + 18);
    ctx.restore();
  });
}

function normalizeBbox(bbox, index, total) {
  if (
    bbox &&
    Number.isFinite(bbox.x) &&
    Number.isFinite(bbox.y) &&
    Number.isFinite(bbox.width) &&
    Number.isFinite(bbox.height)
  ) {
    let { x, y, width, height } = bbox;
    const largest = Math.max(Math.abs(x), Math.abs(y), Math.abs(width), Math.abs(height));
    if (largest <= 1.5) {
      x *= 100;
      y *= 100;
      width *= 100;
      height *= 100;
    } else if (largest > 100 && largest <= 1000) {
      x /= 10;
      y /= 10;
      width /= 10;
      height /= 10;
    }
    x = clamp(x, 0, 99);
    y = clamp(y, 0, 99);
    width = clamp(width, 2, 100 - x);
    height = clamp(height, 2, 100 - y);
    return {
      x,
      y,
      width,
      height,
    };
  }
  const cols = Math.ceil(Math.sqrt(total || 1));
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: 6 + col * 26, y: 8 + row * 28, width: 20, height: 18 };
}

async function analyzeHardware() {
  await refreshServerConfig();
  const idea = els.ideaText.value.trim();
  if (!state.imageDataUrl) {
    setStatus(els.transcriptBox, "Start with one clear photo of your parts. I’ll use that as the map.", "danger");
    return;
  }
  if (!idea) {
    setStatus(els.transcriptBox, "Tell me the goal in plain language. One sentence is enough.", "danger");
    return;
  }

  els.analyzeButton.disabled = true;
  els.analyzeButton.textContent = "Making your guide...";

  try {
    if (!serverConfig.hasOpenAIKey) {
      setStatus(
        els.transcriptBox,
        "I can’t reach the AI key yet. Once the key is in place, I can make your guide.",
        "danger",
      );
      return;
    }

    setStatus(
      els.transcriptBox,
      "I’m looking closely at the photo and planning the safest order. This can take a minute.",
      "warn",
    );

    const payload = {
      model: settings.openaiModel,
      reasoning: { effort: settings.openaiReasoningEffort || "high" },
      input: [
        {
          role: "system",
          content:
            "You are CircuitCodex, an expert hardware build agent for beginners. Identify the actual visible IoT parts from the uploaded photo, produce tight normalized bounding boxes, make conservative ESP32 wiring choices, flag uncertainty, avoid unsafe pins, and output only schema-valid JSON. Never use canned/demo component names or boxes. Do not generate source code in this step.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildAnalysisPrompt(idea),
            },
            {
              type: "input_image",
              image_url: state.imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "hardware_project_plan",
          strict: true,
          schema: hardwarePlanSchema,
        },
      },
    };

    const data = await apiJson("/api/openai/responses", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.plan = normalizePlan(parseStructuredJson(data, "hardware plan"));
    state.plan.warnings = [...validatePlan(state.plan), ...state.plan.warnings];
    state.activeBuildStepIndex = 0;
    renderPlan();
    setStatus(
      els.transcriptBox,
      `I found ${state.plan.parts.length} part(s). Now I’m writing the code that matches your build.`,
      "ok",
    );
    try {
      await generateFirmwareForPlan(idea);
      renderPlan();
      setStatus(
        els.transcriptBox,
        "Your guide and code are ready. Let’s build it one step at a time.",
        "ok",
      );
    } catch (firmwareError) {
      console.error(firmwareError);
      renderPlan();
      setStatus(
        els.transcriptBox,
        `The picture guide is ready, but I couldn’t finish the code yet: ${firmwareError.message}`,
        "warn",
      );
    }
    setActiveWorkflowStage(1);
  } catch (error) {
    console.error(error);
    setStatus(els.transcriptBox, `I got stuck while making the guide: ${error.message}`, "danger");
  } finally {
    els.analyzeButton.disabled = false;
    els.analyzeButton.textContent = "Create my guide";
  }
}

function buildAnalysisPrompt(idea) {
  return [
    `Project idea: ${idea}`,
    "",
    "Return a beginner-safe hardware plan for the actual visible parts in this uploaded image.",
    "Do not use example/demo/static values. Every part name and bounding box must be based on visual evidence in this exact photo.",
    "Use tight bounding boxes around each physical component. Coordinates may be 0-100 percentages or 0-1000 normalized image coordinates.",
    "Assign stable part ids like esp32_main, pir_sensor, led_pack, resistor_strip, servo_motor. Use those ids in wiringSteps.fromPartId and wiringSteps.toPartId.",
    "For an ESP32 DevKit, look for the module with a metal RF shield, USB connector, boot/reset buttons, and two rows of pins.",
    "For a PIR sensor, look for a white Fresnel dome. Do not label a black circular speaker/display/module as PIR unless it visually matches.",
    "For LEDs/resistors, distinguish loose LEDs, resistor bags/strips, jumper wires, servo motors, displays, relay/audio modules, and breadboards if visible.",
    "If a part is ambiguous, name it as 'possible ...' and reduce confidence rather than guessing.",
    "Prefer ESP32 pins that are usually safe for beginner projects.",
    "For every wiring step, include fromPartId, toPartId, from, to, pin, and a beginner-friendly wireColor.",
    "Do not claim certainty for ambiguous modules; put uncertainty in warnings.",
    "Do not generate source code in this vision/planning step.",
    "Instead, return a compact firmwareSpec with chosen pins, libraries, serial protocol markers, and behavior.",
    "Include diagnostic tests that can be judged from serial logs and simple camera observations.",
  ].join("\n");
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  const chunks = [];
  for (const output of data.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
      if (typeof content.value === "string") chunks.push(content.value);
    }
  }
  const text = chunks.join("\n").trim();
  if (!text) throw new Error("OpenAI response did not contain output text.");
  return text;
}

function parseStructuredJson(data, label) {
  if (data.status === "incomplete") {
    const reason = data.incomplete_details?.reason || "unknown reason";
    throw new Error(`${label} response was incomplete (${reason}). Try again with a smaller photo or lower detail.`);
  }
  const text = extractOutputText(data);
  try {
    return JSON.parse(text);
  } catch (error) {
    const preview = text.slice(Math.max(0, text.length - 240));
    throw new Error(
      `${label} JSON was invalid, likely because the model response was truncated. ${error.message}. Tail: ${preview}`,
    );
  }
}

async function generateFirmwareForPlan(idea) {
  if (!state.plan) return;
  els.firmwareOutput.textContent = "Generating firmware from verified hardware plan...";

  const payload = {
    model: settings.openaiReasoningModel,
    reasoning: { effort: settings.openaiReasoningEffort || "high" },
    input: [
      {
        role: "system",
        content:
          "You are CircuitCodex firmware engineer. Generate a compact, compile-ready Arduino .ino sketch for ESP32 from the provided hardware plan. Output only schema-valid JSON. Do not include markdown fences. Keep the sketch under 180 lines unless absolutely required.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildFirmwarePrompt(idea, state.plan),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "esp32_firmware",
        strict: true,
        schema: firmwareSchema,
      },
    },
  };

  const data = await apiJson("/api/openai/responses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.plan.firmware = normalizeFirmware(parseStructuredJson(data, "firmware"));
}

function buildFirmwarePrompt(idea, plan) {
  return [
    `Project idea: ${idea}`,
    "",
    "Hardware plan JSON:",
    JSON.stringify(
      {
        projectTitle: plan.projectTitle,
        summary: plan.summary,
        parts: plan.parts.map(({ id, name, type, confidence, role }) => ({
          id,
          name,
          type,
          confidence,
          role,
        })),
        wiringSteps: plan.wiringSteps,
        diagnosticTests: plan.diagnosticTests,
        firmwareSpec: plan.firmwareSpec,
        warnings: plan.warnings,
      },
      null,
      2,
    ),
    "",
    "Requirements:",
    "- Generate one complete Arduino C++ sketch for ESP32.",
    "- Include Serial.begin(115200).",
    "- Print CIRCUITCODEX_DIAGNOSTIC_READY in setup().",
    "- Print clear diagnostic markers matching the diagnostic tests.",
    "- Avoid unsafe boot pins unless the plan explicitly requires them.",
    "- If the hardware plan is uncertain, make the sketch conservative and explain the assumption in notes.",
    "- Do not include markdown fences in the sketch string.",
  ].join("\n");
}

function normalizeFirmware(firmware) {
  return {
    language: firmware?.language || "Arduino C++",
    sketch: String(firmware?.sketch || "").trim(),
    notes: firmware?.notes || "",
  };
}

function normalizePlan(plan) {
  return {
    projectTitle: plan.projectTitle || "CircuitCodex Build",
    summary: plan.summary || "",
    parts: Array.isArray(plan.parts) ? plan.parts : [],
    warnings: Array.isArray(plan.warnings) ? plan.warnings : [],
    wiringSteps: Array.isArray(plan.wiringSteps) ? plan.wiringSteps.map(normalizeWiringStep) : [],
    diagnosticTests: Array.isArray(plan.diagnosticTests) ? plan.diagnosticTests : [],
    firmwareSpec: plan.firmwareSpec || {
      board: "ESP32",
      behavior: plan.summary || "",
      libraries: [],
      pinAssignments: [],
      serialProtocol: [],
    },
    firmware: plan.firmware ? normalizeFirmware(plan.firmware) : null,
    readmeMarkdown: plan.readmeMarkdown || "",
  };
}

function normalizeWiringStep(step, index) {
  return {
    order: Number.isFinite(step.order) ? step.order : index + 1,
    title: step.title || `Connection ${index + 1}`,
    instruction: step.instruction || "",
    from: step.from || "",
    to: step.to || "",
    fromPartId: step.fromPartId || "",
    toPartId: step.toPartId || "",
    pin: step.pin || "",
    wireColor: step.wireColor || "",
    check: step.check || "",
  };
}

function validatePlan(plan) {
  const warnings = [];
  const avoidPins = new Set(["GPIO0", "GPIO2", "GPIO12", "GPIO15", "0", "2", "12", "15"]);
  for (const step of plan.wiringSteps || []) {
    const pin = String(step.pin || "").toUpperCase().replace(/\s+/g, "");
    if (avoidPins.has(pin)) {
      warnings.push(`Review ${step.pin}: it can affect ESP32 boot behavior on some boards.`);
    }
  }
  if (!plan.parts.some((part) => /esp32/i.test(part.name))) {
    warnings.push("No ESP32 was confidently identified in the image.");
  }
  return warnings;
}

function renderEmptyPlan() {
  els.partsList.innerHTML = "";
  els.wiringList.innerHTML = "";
  els.diagnosticsList.innerHTML = "";
  els.visualStepList.innerHTML = `<div class="visual-step-empty"><strong>Your guide will appear here</strong><span>Once I read the photo, I’ll show one clear move at a time.</span></div>`;
  if (els.buildStepCounter) els.buildStepCounter.textContent = "Move 0 of 0";
  if (els.buildStepDots) els.buildStepDots.innerHTML = "";
  if (els.prevBuildStepButton) els.prevBuildStepButton.disabled = true;
  if (els.nextBuildStepButton) els.nextBuildStepButton.disabled = true;
}

function renderPlan() {
  const plan = state.plan;
  if (!plan) return renderEmptyPlan();

  drawPartsCanvas();
  els.partsList.innerHTML = "";
  plan.parts.forEach((part) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `<strong></strong><span></span>`;
    row.querySelector("strong").textContent = part.name;
    row.querySelector("span").textContent = `${part.role} · ${Math.round((part.confidence || 0) * 100)}% confidence`;
    els.partsList.append(row);
  });
  if (!plan.parts.length) renderEmptyPlan();

  els.wiringList.innerHTML = "";
  plan.wiringSteps.forEach((step) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong></strong><span></span>`;
    item.querySelector("strong").textContent = `${step.order}. ${step.title}`;
    item.querySelector("span").textContent = `${step.instruction} Check: ${step.check}`;
    els.wiringList.append(item);
  });

  els.diagnosticsList.innerHTML = "";
  [...plan.diagnosticTests, ...plan.warnings.map(warningToDiagnostic)].forEach((check) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `<strong></strong><span></span>`;
    row.querySelector("strong").textContent = check.name;
    row.querySelector("span").textContent = `${check.purpose} Expected: ${check.expectedSerial}`;
    els.diagnosticsList.append(row);
  });

  els.firmwareOutput.textContent =
    plan.firmware?.sketch ||
    "I’m still preparing the code for this build.";
  renderVisualSteps();
  state.readme = buildReadme();
  els.readmePreview.textContent = state.readme;
}

function warningToDiagnostic(warning) {
  return {
    name: "Warning",
    purpose: warning,
    userAction: "Review before wiring.",
    expectedSerial: "Manual review required.",
  };
}

function renderVisualSteps() {
  if (!els.visualStepList) return;
  const plan = state.plan;
  if (!plan?.wiringSteps?.length || !state.imageElement) {
    renderEmptyPlan();
    return;
  }

  const steps = plan.wiringSteps;
  const activeIndex = clamp(state.activeBuildStepIndex, 0, steps.length - 1);
  state.activeBuildStepIndex = activeIndex;
  const step = steps[activeIndex];

  els.visualStepList.innerHTML = "";
  const card = document.createElement("div");
  card.className = "visual-step-card is-active";
  const canvas = document.createElement("canvas");
  const title = document.createElement("strong");
  const body = document.createElement("span");
  const check = document.createElement("em");
  title.textContent = `Move ${step.order || activeIndex + 1}: ${step.title}`;
  body.textContent = step.instruction;
  check.textContent = step.check ? `Before you continue: ${step.check}` : "";
  card.append(canvas, title, body);
  if (check.textContent) card.append(check);
  els.visualStepList.append(card);

  if (els.buildStepCounter) els.buildStepCounter.textContent = `Move ${activeIndex + 1} of ${steps.length}`;
  renderBuildStepDots(steps.length, activeIndex);
  if (els.prevBuildStepButton) els.prevBuildStepButton.disabled = activeIndex === 0;
  if (els.nextBuildStepButton) els.nextBuildStepButton.disabled = activeIndex === steps.length - 1;

  requestAnimationFrame(() => drawVisualStep(canvas, step, activeIndex));
}

function renderBuildStepDots(count, activeIndex) {
  if (!els.buildStepDots) return;
  els.buildStepDots.innerHTML = "";
  for (let index = 0; index < count; index += 1) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = index === activeIndex ? "is-active" : "";
    dot.setAttribute("aria-label", `Go to build step ${index + 1}`);
    dot.addEventListener("click", () => setActiveBuildStep(index));
    els.buildStepDots.append(dot);
  }
}

function setActiveBuildStep(index) {
  const count = state.plan?.wiringSteps?.length || 0;
  if (!count) return;
  state.activeBuildStepIndex = clamp(index, 0, count - 1);
  renderVisualSteps();
}

function drawVisualStep(canvas, step, index) {
  const prepared = prepareCanvas(canvas);
  const { ctx, width, height } = prepared;
  const fit = drawImageCanvasBase(ctx, width, height);
  if (!fit || !state.plan?.parts?.length) return;

  const parts = state.plan.parts;
  const fromPart = findStepPart(step.fromPartId || step.from, step, parts, "from");
  const toPart = findStepPart(step.toPartId || step.to, step, parts, "to");
  const color = stepColor(step.wireColor, index);

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
  ctx.fillRect(fit.x, fit.y, fit.width, fit.height);
  ctx.restore();

  if (fromPart) drawStepPart(ctx, fit, fromPart, "#ffffff", "Start");
  if (toPart && toPart !== fromPart) drawStepPart(ctx, fit, toPart, color, "Connect");

  if (fromPart && toPart && fromPart !== toPart) {
    const fromCenter = partCenter(fromPart, fit);
    const toCenter = partCenter(toPart, fit);
    drawArrow(ctx, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, color);
    drawStepBadge(ctx, `${step.pin || "wire"}`, (fromCenter.x + toCenter.x) / 2, (fromCenter.y + toCenter.y) / 2, color);
  } else {
    drawStepBadge(ctx, step.pin || step.from || "wire", fit.x + fit.width / 2, fit.y + 28, color);
  }
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, rect.width || 520);
  const height = Math.max(180, rect.height || width * 0.625);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawImageCanvasBase(ctx, width, height) {
  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);
  if (!state.imageElement) return null;

  const img = state.imageElement;
  const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
  const drawWidth = img.naturalWidth * scale;
  const drawHeight = img.naturalHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  ctx.drawImage(img, x, y, drawWidth, drawHeight);
  return { x, y, width: drawWidth, height: drawHeight };
}

function findStepPart(reference, step, parts, side) {
  const direct = matchPart(reference, parts);
  if (direct) return direct;
  const sideText = side === "from" ? step.from : step.to;
  const textMatch = matchPart(sideText, parts);
  if (textMatch) return textMatch;

  const allText = `${step.title} ${step.instruction} ${step.from} ${step.to}`.toLowerCase();
  if (side === "from") {
    return parts.find((part) => /esp32|devkit|microcontroller/.test(`${part.id} ${part.name} ${part.type}`.toLowerCase())) || null;
  }
  return (
    parts.find((part) => {
      const key = normalizeText(`${part.id} ${part.name} ${part.type}`);
      return key && allText.includes(key.split(" ")[0]);
    }) || null
  );
}

function matchPart(reference, parts) {
  const ref = normalizeText(reference || "");
  if (!ref) return null;
  return (
    parts.find((part) => normalizeText(part.id) === ref) ||
    parts.find((part) => ref.includes(normalizeText(part.id)) || normalizeText(part.name).includes(ref)) ||
    parts.find((part) => ref.includes(normalizeText(part.name)) || normalizeText(part.name).includes(ref.split(" ")[0]))
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function partBox(part, fit) {
  const bbox = normalizeBbox(part.bbox, 0, 1);
  return {
    x: fit.x + (bbox.x / 100) * fit.width,
    y: fit.y + (bbox.y / 100) * fit.height,
    width: (bbox.width / 100) * fit.width,
    height: (bbox.height / 100) * fit.height,
  };
}

function partCenter(part, fit) {
  const box = partBox(part, fit);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function drawStepPart(ctx, fit, part, color, prefix) {
  const box = partBox(part, fit);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  drawStepBadge(ctx, `${prefix}: ${part.name}`, box.x + box.width / 2, Math.max(fit.y + 24, box.y - 14), color);
  ctx.restore();
}

function drawArrow(ctx, fromX, fromY, toX, toY, color) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLength = 16;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStepBadge(ctx, text, centerX, centerY, color) {
  const safeText = String(text || "").slice(0, 42);
  ctx.save();
  ctx.font = "800 13px Inter, system-ui, sans-serif";
  const width = Math.min(ctx.measureText(safeText).width + 18, 260);
  const height = 28;
  const x = clamp(centerX - width / 2, 8, ctx.canvas.width / (window.devicePixelRatio || 1) - width - 8);
  const y = clamp(centerY - height / 2, 8, ctx.canvas.height / (window.devicePixelRatio || 1) - height - 8);
  const paleBadge = color === "#ffffff" || color === "#e5e7eb" || color === "#f5f5f5";
  ctx.fillStyle = paleBadge ? "rgba(255,255,255,0.92)" : color;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = paleBadge ? "#050507" : "#fff";
  ctx.fillText(safeText, x + 9, y + 18, width - 18);
  ctx.restore();
}

function stepColor(value, index) {
  const palette = ["#8b5cf6", "#ffffff", "#d4d4d8", "#a1a1aa", "#f5f5f5", "#71717a"];
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("red")) return "#ffffff";
  if (normalized.includes("black")) return "#e5e7eb";
  if (normalized.includes("yellow")) return "#f5f5f5";
  if (normalized.includes("blue")) return "#c4b5fd";
  if (normalized.includes("green")) return "#d4d4d8";
  return palette[index % palette.length];
}

async function startVoiceCapture() {
  if (!settings.deepgramApiKey) {
    setVoiceStatus("Voice setup needed", "danger");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setVoiceStatus("Mic unavailable", "danger");
    return;
  }

  setVoiceStatus("Getting ready", "warn");
  els.startVoiceButton.disabled = true;
  els.stopVoiceButton.disabled = false;

  try {
    const url = new URL("wss://api.deepgram.com/v1/listen");
    url.searchParams.set("model", "nova-3");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("interim_results", "true");
    url.searchParams.set("endpointing", "500");
    url.searchParams.set("utterance_end_ms", "1000");
    url.searchParams.set("vad_events", "true");

    state.deepgramSocket = new WebSocket(url, ["token", settings.deepgramApiKey]);
    state.deepgramSocket.onopen = async () => {
      state.voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      state.voiceRecorder = new MediaRecorder(state.voiceStream, { mimeType });
      state.voiceRecorder.ondataavailable = async (event) => {
        if (event.data.size && state.deepgramSocket?.readyState === WebSocket.OPEN) {
          state.deepgramSocket.send(await event.data.arrayBuffer());
        }
      };
      state.voiceRecorder.start(250);
      setVoiceStatus("Listening", "ok");
    };
    state.deepgramSocket.onmessage = (message) => handleDeepgramMessage(message.data);
    state.deepgramSocket.onerror = () => setVoiceStatus("Voice paused", "danger");
    state.deepgramSocket.onclose = () => {
      if (els.stopVoiceButton.disabled === false) setVoiceStatus("Stopped", "warn");
    };
  } catch (error) {
    console.error(error);
    setVoiceStatus(error.message, "danger");
    stopVoiceCapture();
  }
}

function handleDeepgramMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  if (message.type !== "Results") return;
  const transcript = message.channel?.alternatives?.[0]?.transcript || "";
  if (!transcript) return;

  if (message.is_final || message.speech_final) {
    state.finalTranscript = [state.finalTranscript, transcript].filter(Boolean).join(" ").trim();
    state.interimTranscript = "";
    els.ideaText.value = [els.ideaText.value.trim(), transcript].filter(Boolean).join(" ").trim();
  } else {
    state.interimTranscript = transcript;
  }
  els.transcriptBox.textContent = [state.finalTranscript, state.interimTranscript]
    .filter(Boolean)
    .join(" ");
}

function stopVoiceCapture() {
  try {
    if (state.deepgramSocket?.readyState === WebSocket.OPEN) {
      state.deepgramSocket.send(JSON.stringify({ type: "Finalize" }));
      state.deepgramSocket.send(JSON.stringify({ type: "CloseStream" }));
    }
  } catch {
    // Best effort finalization.
  }
  state.voiceRecorder?.stop();
  state.voiceStream?.getTracks().forEach((track) => track.stop());
  state.deepgramSocket?.close();
  state.voiceRecorder = null;
  state.voiceStream = null;
  state.deepgramSocket = null;
  els.startVoiceButton.disabled = false;
  els.stopVoiceButton.disabled = true;
  setVoiceStatus("Ready", "");
}

function setVoiceStatus(text, tone) {
  els.voiceStatus.textContent = text;
  els.voiceStatus.className = `status-pill ${tone || ""}`.trim();
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    setStatus(els.logEvaluation, "This browser can’t listen to the board. Use Chrome or Edge on desktop.", "danger");
    return;
  }

  try {
    state.serialPort = await navigator.serial.requestPort({
      filters: [
        { usbVendorId: 0x10c4 },
        { usbVendorId: 0x1a86 },
        { usbVendorId: 0x0403 },
        { usbVendorId: 0x303a },
      ],
    });
    await state.serialPort.open({ baudRate: Number(els.baudRateInput.value) || 115200 });
    els.connectSerialButton.disabled = true;
    els.disconnectSerialButton.disabled = false;
    els.sendSerialButton.disabled = false;
    appendSerial("CircuitCodex: I’m listening now. If the board speaks, you’ll see it here.\n");
    setStatus(els.logEvaluation, "Connected. Waiting for the board to say something.", "ok");
    readSerialLoop();
  } catch (error) {
    console.error(error);
    setStatus(els.logEvaluation, `I couldn’t connect yet: ${error.message}`, "danger");
  }
}

async function readSerialLoop() {
  const decoder = new TextDecoderStream();
  state.serialReadableClosed = state.serialPort.readable.pipeTo(decoder.writable).catch(() => {});
  state.serialReader = decoder.readable.getReader();

  try {
    while (true) {
      const { value, done } = await state.serialReader.read();
      if (done) break;
      if (value) appendSerial(value);
    }
  } catch (error) {
    appendSerial(`\n[serial read stopped] ${error.message}\n`);
  } finally {
    state.serialReader.releaseLock();
  }
}

async function disconnectSerial() {
  try {
    await state.serialReader?.cancel();
    await state.serialReadableClosed;
    await state.serialPort?.close();
  } catch (error) {
    console.error(error);
  }
  state.serialReader = null;
  state.serialReadableClosed = null;
  state.serialPort = null;
  els.connectSerialButton.disabled = false;
  els.disconnectSerialButton.disabled = true;
  els.sendSerialButton.disabled = true;
  appendSerial("CircuitCodex: I stopped listening to the board.\n");
}

async function sendSerialCommand() {
  const command = els.serialCommandInput.value;
  if (!state.serialPort || !command) return;

  const writer = state.serialPort.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${command}\n`));
    appendSerial(`> ${command}\n`);
    els.serialCommandInput.value = "";
  } finally {
    writer.releaseLock();
  }
}

function appendSerial(text) {
  if (els.serialLog.textContent === "Board messages will appear here after you connect.") {
    els.serialLog.textContent = "";
  }
  state.serialLog += text;
  if (state.serialLog.length > 25000) state.serialLog = state.serialLog.slice(-25000);
  els.serialLog.textContent = state.serialLog;
  els.serialLog.scrollTop = els.serialLog.scrollHeight;
}

function evaluateSerialLogs() {
  const log = state.serialLog.trim();
  if (!log) {
    setStatus(els.logEvaluation, "Nothing from the board yet. Try pressing reset on the ESP32.", "warn");
    return;
  }

  const bad = /(error|failed|fail|nan|timeout|brownout|invalid|panic|rst:0x10)/i.test(log);
  const expected = state.plan?.diagnosticTests || [];
  const hits = expected.filter((test) => {
    const token = String(test.expectedSerial || "").split(/\s+/)[0];
    return token && log.includes(token);
  });

  if (bad) {
    setStatus(els.logEvaluation, "Something looks off. I see words that usually mean the board is stuck or unhappy.", "danger");
  } else if (expected.length && hits.length >= Math.max(1, Math.ceil(expected.length / 2))) {
    setStatus(els.logEvaluation, "This looks good. The board is saying the things we expected.", "ok");
  } else if (/ready|ok|pass|sensor|boot|connected/i.test(log)) {
    setStatus(els.logEvaluation, "Good sign. The board is awake and talking.", "ok");
  } else {
    setStatus(els.logEvaluation, "I can hear the board, but I’m not sure yet. Try the action your project is meant to react to.", "warn");
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(els.behaviorEvaluation, "I can’t open the camera in this browser.", "danger");
    return;
  }
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    els.cameraPreview.srcObject = state.cameraStream;
    await els.cameraPreview.play();
    els.captureEvidenceButton.disabled = false;
    setStatus(els.behaviorEvaluation, "Camera ready. Point it at the project when you want me to check.", "ok");
  } catch (error) {
    console.error(error);
    setStatus(els.behaviorEvaluation, `I couldn’t open the camera yet: ${error.message}`, "danger");
  }
}

function captureEvidence() {
  if (!state.cameraStream) return "";
  const video = els.cameraPreview;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  state.evidencePhotos.unshift({ dataUrl, takenAt: new Date().toISOString() });
  state.evidencePhotos = state.evidencePhotos.slice(0, 6);
  renderEvidence();
  return dataUrl;
}

function renderEvidence() {
  els.evidenceStrip.innerHTML = "";
  state.evidencePhotos.forEach((photo) => {
    const img = document.createElement("img");
    img.src = photo.dataUrl;
    img.alt = `Evidence captured at ${photo.takenAt}`;
    els.evidenceStrip.append(img);
  });
}

async function verifyBehavior() {
  await refreshServerConfig();
  let latest = state.evidencePhotos[0]?.dataUrl || "";
  if (!latest && state.cameraStream) latest = captureEvidence();
  if (!latest) {
    setStatus(els.behaviorEvaluation, "Take one photo of the build first, then I can check it.", "warn");
    return;
  }
  if (!serverConfig.hasOpenAIKey) {
    setStatus(els.behaviorEvaluation, "The AI key is not ready yet, so I can’t check the photo.", "warn");
    return;
  }

  els.verifyBehaviorButton.disabled = true;
  els.verifyBehaviorButton.textContent = "Checking...";
  try {
    const payload = {
      model: settings.openaiReasoningModel,
      reasoning: { effort: settings.openaiReasoningEffort || "high" },
      input: [
        {
          role: "system",
          content:
            "You verify beginner electronics behavior from a webcam frame and serial logs. Be conservative and return schema-valid JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Project: ${state.plan?.projectTitle || "Unknown"}`,
                `Goal: ${els.ideaText.value.trim()}`,
                `Recent serial logs:\n${state.serialLog.slice(-3000) || "No logs captured."}`,
                "Judge whether the visible behavior matches the requested project.",
              ].join("\n\n"),
            },
            { type: "input_image", image_url: latest, detail: "high" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "behavior_verification",
          strict: true,
          schema: behaviorSchema,
        },
      },
    };
    const data = await apiJson("/api/openai/responses", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const result = JSON.parse(extractOutputText(data));
    const tone = result.status === "pass" ? "ok" : result.status === "fail" ? "danger" : "warn";
    setStatus(
      els.behaviorEvaluation,
      `${friendlyBehaviorStatus(result.status)} ${result.observations.join(" ")} Next, ${result.nextStep}`,
      tone,
    );
  } catch (error) {
    console.error(error);
    setStatus(els.behaviorEvaluation, `I couldn’t finish the visual check: ${error.message}`, "danger");
  } finally {
    els.verifyBehaviorButton.disabled = false;
    els.verifyBehaviorButton.textContent = "Check behavior";
  }
}

function friendlyBehaviorStatus(status) {
  if (status === "pass") return "Looks right.";
  if (status === "fail") return "Something is off.";
  if (status === "needs_attention") return "Let’s check this carefully.";
  return "I’m not fully sure yet.";
}

function loadEspManifest() {
  const manifestUrl = els.manifestUrlInput.value.trim();
  if (!manifestUrl) {
    setStatus(els.arduinoStatus, "Add a firmware link first.", "warn");
    return;
  }
  els.espInstallButton.setAttribute("manifest", manifestUrl);
  els.espInstallButton.manifest = manifestUrl;
  setStatus(els.arduinoStatus, "Firmware link is ready.", "ok");
}

async function refreshArduinoStatus() {
  try {
    const status = await apiJson("/api/arduino/status");
    if (status.hostedMode) {
      setStatus(
        els.arduinoStatus,
        "Online guide mode is ready. To put code on a real ESP32, open this project locally where Arduino is installed.",
        "warn",
      );
      els.compileFlashButton.disabled = true;
      els.compileFlashButton.textContent = "Local app needed";
      setFlashProgress(0, "");
      return;
    }
    const tone = status.hasArduinoCli && status.hasEsp32Core ? "ok" : "warn";
    setStatus(
      els.arduinoStatus,
      status.hasArduinoCli && status.hasEsp32Core
        ? "Your computer is ready to load code onto the board."
        : "One setup piece is missing. I’ll still keep the board settings here so we can fix it.",
      tone,
    );
    if (status.fqbn) {
      settings.arduinoFqbn = status.fqbn;
      els.boardFqbnInput.value = status.fqbn;
    }
  } catch (error) {
    setStatus(els.arduinoStatus, `I couldn’t check the setup yet: ${error.message}`, "danger");
  }
}

async function compileAndFlashFirmware() {
  if (serverConfig.hostedMode || serverConfig.firmwareCompileSupported === false) {
    setStatus(
      els.arduinoStatus,
      "This online version can guide the build and write the code. Loading it onto the ESP32 needs the local app with Arduino installed.",
      "warn",
    );
    return;
  }

  if (!("serial" in navigator)) {
    setStatus(els.arduinoStatus, "This browser can’t talk to the board. Use Chrome or Edge on desktop.", "danger");
    return;
  }

  const sketch = state.plan?.firmware?.sketch || "";
  if (!sketch) {
    setStatus(els.arduinoStatus, "Create the guide first, then I’ll have code to send.", "warn");
    return;
  }

  els.compileFlashButton.disabled = true;
  els.compileFlashButton.textContent = "Choose board...";
  setFlashProgress(0, "Choose your board");

  let port;
  try {
    if (state.serialPort) await disconnectSerial();
    port = await requestEspPort();
  } catch (error) {
    els.compileFlashButton.disabled = false;
    els.compileFlashButton.textContent = "Put code on board";
    setStatus(els.arduinoStatus, `No problem. Choose the board again when you’re ready. ${error.message}`, "warn");
    setFlashProgress(0, "");
    return;
  }

  try {
    const fqbn = els.boardFqbnInput.value.trim() || settings.arduinoFqbn || "esp32:esp32:esp32";
    settings.arduinoFqbn = fqbn;
    els.compileFlashButton.textContent = "Preparing code...";
    setStatus(els.arduinoStatus, "I’m preparing the code for your board.", "warn");
    appendSerial("\nCircuitCodex: Preparing the code for your board.\n");

    const compiled = await apiJson("/api/firmware/compile", {
      method: "POST",
      body: JSON.stringify({ sketch, fqbn }),
    });
    state.compiledFirmware = compiled;
    appendSerial("CircuitCodex: Code is ready. Now I’m sending it to the board.\n");
    if (compiled.stderr) appendSerial(`CircuitCodex: Setup note from the compiler:\n${compiled.stderr}\n`);

    els.compileFlashButton.textContent = "Loading board...";
    await flashFirmwareImages(port, compiled.images);
    setStatus(els.arduinoStatus, "Done. The code is on the board. Continue when you’re ready to watch it work.", "ok");
    setFlashProgress(100, "Done");
  } catch (error) {
    console.error(error);
    appendSerial(`\nCircuitCodex: I couldn’t finish loading the board. ${error.message}\n`);
    setStatus(els.arduinoStatus, `I couldn’t finish loading the board: ${error.message}`, "danger");
    setFlashProgress(0, "Needs retry");
  } finally {
    els.compileFlashButton.disabled = false;
    els.compileFlashButton.textContent = "Put code on board";
  }
}

function requestEspPort() {
  return navigator.serial.requestPort({
    filters: [
      { usbVendorId: 0x10c4 },
      { usbVendorId: 0x1a86 },
      { usbVendorId: 0x0403 },
      { usbVendorId: 0x303a },
    ],
  });
}

async function flashFirmwareImages(port, images) {
  if (!images?.length) throw new Error("No firmware images were returned from the compiler.");

  const esptool = await import("https://unpkg.com/esptool-js@0.5.7/bundle.js");
  const transport = new esptool.Transport(port, true);
  const terminal = {
    clean() {
      appendSerial("\nCircuitCodex: Starting a fresh board load.\n");
    },
    writeLine(data) {
      appendSerial(`Board loader: ${data}\n`);
    },
    write(data) {
      appendSerial(`Board loader: ${data}`);
    },
  };

  try {
    const esploader = new esptool.ESPLoader({
      transport,
      baudrate: 115200,
      terminal,
      debugLogging: false,
    });
    appendSerial("CircuitCodex: Looking for the ESP32. If it waits here, hold BOOT on the board for a moment.\n");
    const chip = await esploader.main("default_reset");
    appendSerial(`CircuitCodex: Found the board (${chip}).\n`);

    const fileArray = images.map((image) => ({
      data: base64ToBinaryString(image.dataBase64),
      address: image.address,
    }));
    appendSerial("CircuitCodex: Sending the code now.\n");
    await esploader.writeFlash({
      fileArray,
      flashMode: "dio",
      flashFreq: "40m",
      flashSize: "4MB",
      eraseAll: Boolean(els.eraseFlashInput.checked),
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        const percent = total ? Math.round((written / total) * 100) : 0;
        const image = images[fileIndex] || images[0];
        setFlashProgress(percent, `${image?.name || "image"} ${percent}%`);
      },
    });
    await esploader.after("hard_reset");
    appendSerial("CircuitCodex: Board restarted with the new code.\n");
  } finally {
    await transport.disconnect();
  }
}

function base64ToBinaryString(base64) {
  return atob(base64);
}

function setFlashProgress(percent, label) {
  els.flashProgressBar.style.width = `${clamp(percent, 0, 100)}%`;
  els.flashProgressBar.textContent = label || "";
}

function copyFirmware() {
  const sketch = state.plan?.firmware?.sketch || "";
  if (!sketch) return;
  navigator.clipboard.writeText(sketch).then(() => {
    els.copyFirmwareButton.textContent = "Copied";
    setTimeout(() => (els.copyFirmwareButton.textContent = "Copy"), 1000);
  });
}

function downloadFirmware() {
  const sketch = state.plan?.firmware?.sketch || "";
  if (!sketch) {
    setStatus(els.arduinoStatus, "There isn’t code to download yet. Create the guide first.", "warn");
    return;
  }
  downloadText("circuitcodex-firmware.ino", sketch, "text/x-arduino");
}

function buildReadme() {
  const plan = state.plan;
  if (!plan) return "Create your guide first, then I’ll write the project notes here.";
  const generated = new Date().toISOString();
  const firmwareSketch = plan.firmware?.sketch || "Firmware generation pending.";
  const firmwareNotes = plan.firmware?.notes || "Review all wiring before powering the board.";
  const parts = plan.parts.map((part) => `- ${part.name}: ${part.role}`).join("\n");
  const wiring = plan.wiringSteps
    .map((step) => `${step.order}. ${step.title}: ${step.instruction}`)
    .join("\n");
  const checks = plan.diagnosticTests
    .map((test) => `- ${test.name}: ${test.userAction} Expected serial: \`${test.expectedSerial}\``)
    .join("\n");
  const warnings = plan.warnings.length
    ? `\n## Warnings\n\n${plan.warnings.map((warning) => `- ${warning}`).join("\n")}\n`
    : "";
  const evidence = state.evidencePhotos.length
    ? `\n## Evidence\n\nCaptured ${state.evidencePhotos.length} camera frame(s) during verification.\n`
    : "";

  return (
    plan.readmeMarkdown ||
    `# ${plan.projectTitle}

Generated by CircuitCodex on ${generated}.

## Idea

${els.ideaText.value.trim() || plan.summary}

## Parts

${parts || "- Parts pending."}

## Wiring

${wiring || "Wiring pending."}

## Diagnostic Checks

${checks || "- Diagnostics pending."}
${warnings}
## Firmware

\`\`\`cpp
${firmwareSketch}
\`\`\`
${evidence}
## Notes

${firmwareNotes}
`
  );
}

function downloadReadme() {
  state.readme = state.readme || buildReadme();
  downloadText("README.md", state.readme, "text/markdown");
}

async function publishToGitHub() {
  const repoName = sanitizeRepoName(els.repoNameInput.value || "circuitcodex-build");
  const isPrivate = els.privateRepoInput.checked;
  const firmware = state.plan?.firmware?.sketch || "";
  if (!state.plan || !firmware) {
    setStatus(els.githubStatus, "Create the guide and code first, then I can save the project.", "warn");
    return;
  }
  state.readme = state.readme || buildReadme();
  els.githubStatus.textContent = "Creating a home for your project...";
  els.publishGithubButton.disabled = true;

  try {
    let owner = settings.githubOwner;
    try {
      const repo = await apiJson("/api/github/repos", {
        method: "POST",
        body: JSON.stringify({
          name: repoName,
          description: "Hardware project generated with CircuitCodex",
          private: isPrivate,
        }),
      });
      owner = repo.owner?.login || owner;
    } catch (error) {
      if (!String(error.message).includes("422") || !owner) throw error;
      els.githubStatus.textContent = "I found the project space. Now I’m saving the files...";
    }

    if (!owner) throw new Error("I need a GitHub owner in Settings before I can save this.");

    await apiJson("/api/github/upload-file", {
      method: "POST",
      body: JSON.stringify({
        owner,
        repo: repoName,
        path: "README.md",
        content: state.readme,
        message: "Add CircuitCodex README",
      }),
    });

    await apiJson("/api/github/upload-file", {
      method: "POST",
      body: JSON.stringify({
        owner,
        repo: repoName,
        path: "firmware/circuitcodex-firmware.ino",
        content: firmware,
        message: "Add generated ESP32 firmware",
      }),
    });

    const repoUrl = `https://github.com/${owner}/${repoName}`;
    els.githubStatus.innerHTML = `Saved: <a href="${repoUrl}" target="_blank" rel="noreferrer">${repoUrl}</a>`;
  } catch (error) {
    console.error(error);
    setStatus(els.githubStatus, `I couldn’t save it yet: ${error.message}`, "danger");
  } finally {
    els.publishGithubButton.disabled = false;
  }
}

async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const message = data.error?.message || data.message || data.error || `HTTP ${response.status}`;
    throw new Error(`${response.status} ${message}`);
  }
  return data;
}

function setStatus(element, text, tone) {
  element.textContent = text;
  element.className = `status-strip ${tone || ""}`.trim();
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeRepoName(value) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "circuitcodex-build"
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
