import {
  blobToDataUrl,
  canConfirmParts,
  createPartSearchUrl,
  ideaText,
  inventoryCompatibleAlternatives,
  normalizeImageFile,
  requestHardwarePlan,
  updateDetectedPart,
} from "./actions.js";
import { APP_READY_MESSAGE, PRODUCT_NAME } from "./content.js";

const ROUTE_RENDERERS = Object.freeze({
  "/build/new": renderDescribe,
  "/build/parts/upload": renderUpload,
  "/build/parts/review": renderReview,
  "/build/feasibility/ready": renderReady,
  "/build/feasibility/missing": renderMissing,
});

export function createScreenRenderer({ root, app }) {
  const outlet = root.querySelector("[data-screen-outlet]");
  if (!outlet) return Object.freeze({ render() {} });
  const runtime = {
    selectedPartId: null,
    photoUrl: "",
    sketchUrl: "",
    voice: null,
    currentRoute: null,
  };
  const context = {
    root,
    window: root.defaultView,
    outlet,
    app,
    runtime,
    render(route) {
      runtime.currentRoute = route;
      const renderer = ROUTE_RENDERERS[route.path];
      if (!renderer) return;
      renderer(context, route);
    },
  };
  return Object.freeze({ render: context.render });
}

function renderDescribe(context, route) {
  const { outlet, app } = context;
  const project = app.getProject();
  const text = ideaText(project.idea);
  const sketchAttached = Boolean(project.idea?.sketch?.imageId);
  outlet.innerHTML = screenFrame(`
    <article class="route-screen describe-screen">
      <header class="screen-heading">
        <h1>What do you want to make?</h1>
        <button
          class="voice-prompt"
          type="button"
          data-voice-button
          aria-label="Describe with your voice"
        >Tell us like you’d tell a friend.</button>
        <span class="voice-subtitle" data-voice-status aria-live="polite"></span>
      </header>

      <form class="paper-panel idea-panel" data-idea-form>
        <label class="visually-hidden" for="idea-text">Describe your idea</label>
        <textarea
          id="idea-text"
          name="idea"
          aria-label="Describe your idea"
          rows="3"
          placeholder="Build a self-watering plant that checks when the soil is dry."
        >${escapeHtml(text)}</textarea>
        <div class="idea-actions">
          <div class="idea-tools">
            <label class="tool-button" for="sketch-file">
              ${icon("paperclip")}
              <span>Add a sketch</span>
            </label>
            <input
              class="file-input"
              id="sketch-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              aria-label="Add a sketch"
            />
            <span class="attachment-status" data-sketch-status aria-live="polite">${
              sketchAttached ? "Sketch attached" : ""
            }</span>
          </div>
          <button class="primary-button" type="submit" ${text ? "" : "disabled"}>
            Start my build
            ${icon("arrow-right")}
          </button>
        </div>
      </form>

      <section class="example-row" aria-labelledby="examples-heading">
        <p class="annotation-note" id="examples-heading">Messy ideas welcome.</p>
        <button class="example-note example-note--pink" type="button" data-example="Make a pet feeder">A pet feeder</button>
        <button class="example-note example-note--purple" type="button" data-example="Make a mini fan">A mini fan</button>
        <button class="example-note example-note--mint" type="button" data-example="Make a plant helper">A plant helper</button>
      </section>
    </article>
  `);

  const form = outlet.querySelector("[data-idea-form]");
  const textarea = outlet.querySelector("#idea-text");
  const submit = form.querySelector('[type="submit"]');
  textarea.addEventListener("input", () => {
    submit.disabled = !textarea.value.trim();
  });
  for (const button of outlet.querySelectorAll("[data-example]")) {
    button.addEventListener("click", () => {
      textarea.value = button.dataset.example;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    });
  }
  outlet.querySelector("#sketch-file").addEventListener("change", async (event) => {
    const [file] = event.currentTarget.files || [];
    if (!file) return;
    const status = outlet.querySelector("[data-sketch-status]");
    status.textContent = "Preparing sketch…";
    try {
      const normalized = await normalizeImageFile(file);
      await app.saveImage("sketch", normalized.blob);
      const currentIdea =
        typeof app.getProject().idea === "object" && app.getProject().idea
          ? app.getProject().idea
          : {};
      await app.updateProject("idea", {
        ...currentIdea,
        text: textarea.value.trim(),
        sketch: {
          imageId: "sketch",
          width: normalized.width,
          height: normalized.height,
          mimeType: normalized.mimeType,
        },
      });
      status.textContent = "Sketch attached";
    } catch (error) {
      status.textContent = error.message;
    }
  });
  outlet
    .querySelector("[data-voice-button]")
    .addEventListener("click", () => toggleVoice(context, textarea));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = textarea.value.trim();
    if (!value) return;
    stopVoice(context);
    const currentIdea =
      typeof app.getProject().idea === "object" && app.getProject().idea
        ? app.getProject().idea
        : {};
    await app.updateProject("idea", { ...currentIdea, text: value });
    await app.completeRoute(route.path);
    app.navigation.navigate("/build/parts/upload");
  });
}

function renderUpload(context, route) {
  const { outlet } = context;
  outlet.innerHTML = screenFrame(`
    <article class="route-screen upload-screen">
      <header class="screen-heading upload-heading">
        <div>
          <h1>Show me what’s on your desk</h1>
          <p>Put your parts in one photo. I’ll name them for you.</p>
        </div>
        <aside class="privacy-note">Your photo is only used to recognize your parts.</aside>
      </header>

      <div class="camera-row">
        <label class="camera-link" for="camera-file">
          ${icon("camera")}
          <span>Use camera instead</span>
        </label>
        <input
          class="file-input"
          id="camera-file"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Use camera instead"
        />
      </div>

      <section class="paper-panel upload-zone" data-upload-zone aria-labelledby="upload-title">
        ${icon("upload", "upload-hero-icon")}
        <h2 id="upload-title">Drop a photo here</h2>
        <p>or choose from your computer</p>
        <label class="primary-button upload-button" for="parts-file">Upload my parts</label>
        <input
          class="file-input"
          id="parts-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          aria-label="Upload my parts"
        />
        <p class="upload-progress" data-upload-progress role="status" aria-live="polite"></p>
      </section>

      <ul class="photo-tips" aria-label="Photo tips">
        <li>${icon("sparkles")}<span>Use good light</span></li>
        <li>${icon("paperclip")}<span>Spread parts out</span></li>
        <li>${icon("camera")}<span>Shoot from above</span></li>
      </ul>
    </article>
  `);

  const input = outlet.querySelector("#parts-file");
  const cameraInput = outlet.querySelector("#camera-file");
  const zone = outlet.querySelector("[data-upload-zone]");
  const receive = ([file]) => file && handlePartsPhoto(context, route, file);
  input.addEventListener("change", (event) => receive(event.currentTarget.files || []));
  cameraInput.addEventListener("change", (event) =>
    receive(event.currentTarget.files || []),
  );
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-dragging");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-dragging"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragging");
    receive(event.dataTransfer?.files || []);
  });
}

async function handlePartsPhoto(context, route, file) {
  const { outlet, app } = context;
  const progress = outlet.querySelector("[data-upload-progress]");
  const controls = outlet.querySelectorAll("input");
  controls.forEach((control) => (control.disabled = true));
  progress.textContent = "Preparing your photo…";
  try {
    const normalized = await normalizeImageFile(file);
    await app.saveImage("source", normalized.blob);
    await app.updateProject("photo", {
      imageId: "source",
      width: normalized.width,
      height: normalized.height,
      mimeType: normalized.mimeType,
      originalName: normalized.originalName,
    });
    progress.textContent = "Looking closely at your parts…";
    const plan = await requestHardwarePlan({
      idea: ideaText(app.getProject().idea),
      imageDataUrl: await blobToDataUrl(normalized.blob),
    });
    await app.updateProject("confirmedParts", plan.parts);
    await app.updateProject("feasibility", feasibilityRecord(plan));
    await app.updateProject("wiring", { steps: plan.wiringSteps });
    if (plan.firmware) await app.updateProject("firmware", plan.firmware);
    await app.completeRoute(route.path);
    app.navigation.navigate("/build/parts/review");
  } catch (error) {
    progress.textContent = error.message;
    controls.forEach((control) => (control.disabled = false));
  }
}

function renderReview(context, route) {
  const { outlet, app, runtime } = context;
  const parts = app.getProject().confirmedParts || [];
  const selected = parts.find(({ id }) => id === runtime.selectedPartId) || null;
  runtime.selectedPartId = selected?.id || null;
  outlet.innerHTML = screenFrame(`
    <article class="route-screen review-screen">
      <header class="screen-heading review-heading">
        <h1>Let’s name what’s on your desk.</h1>
        <aside class="count-note">We found ${parts.length} ${
          parts.length === 1 ? "thing" : "things"
        }!<small>Select a part to rename or adjust it.</small></aside>
      </header>

      <section class="paper-panel photo-review" aria-label="Detected parts in your uploaded photo">
        <img class="parts-photo" data-source-photo alt="Your uploaded parts" />
        <div class="annotation-layer">
          ${parts
            .map((part, index) => annotationButton(part, index, selected?.id))
            .join("")}
        </div>
      </section>

      <section class="review-controls paper-panel" aria-labelledby="recognized-title">
        <div class="parts-summary">
          <h2 id="recognized-title">We recognized these parts:</h2>
          <ul class="part-chips">
            ${parts.map((part, index) => partChip(part, index, selected?.id)).join("")}
          </ul>
        </div>
        <div class="review-primary">
          ${selected ? partInspector(selected) : ""}
          <button class="primary-button" type="button" data-confirm-parts ${
            canConfirmParts(parts) ? "" : "disabled"
          }>
            Confirm my parts
            ${icon("arrow-right")}
          </button>
          <p class="review-status" data-review-status role="status" aria-live="polite"></p>
        </div>
      </section>
    </article>
  `);
  hydrateStoredImage(context, "source", outlet.querySelector("[data-source-photo]"));

  for (const button of outlet.querySelectorAll("[data-select-part]")) {
    button.addEventListener("click", () => {
      runtime.selectedPartId = button.dataset.selectPart;
      renderReview(context, route);
    });
  }
  for (const button of outlet.querySelectorAll("[data-delete-part]")) {
    button.addEventListener("click", async () => {
      const next = (app.getProject().confirmedParts || []).filter(
        ({ id }) => id !== button.dataset.deletePart,
      );
      await app.updateProject("confirmedParts", next);
      runtime.selectedPartId = next.at(0)?.id || null;
      renderReview(context, route);
    });
  }
  const nameInput = outlet.querySelector("[data-part-name]");
  nameInput?.addEventListener("change", async () => {
    await persistPartEdit(context, selected.id, { name: nameInput.value });
    const annotationLabel = outlet.querySelector(
      `[data-select-part="${escapeSelectorValue(selected.id)}"] strong`,
    );
    if (annotationLabel) annotationLabel.textContent = nameInput.value.trim();
    const confidenceControl = outlet.querySelector("[data-confirm-confidence]");
    confidenceControl?.setAttribute(
      "aria-label",
      `Confirm ${nameInput.value.trim()} despite low confidence`,
    );
    const confidenceText = outlet.querySelector(".confidence-check span");
    if (confidenceText) confidenceText.textContent = `Yes, this is ${nameInput.value.trim()}`;
  });
  for (const input of outlet.querySelectorAll("[data-bound-field]")) {
    input.addEventListener("change", async () => {
      const current = (app.getProject().confirmedParts || []).find(
        ({ id }) => id === selected.id,
      );
      await persistPartEdit(context, selected.id, {
        bounds: {
          ...current.bounds,
          [input.dataset.boundField]: Number(input.value),
        },
      });
      const annotation = outlet.querySelector(
        `.part-annotation[data-select-part="${escapeSelectorValue(selected.id)}"]`,
      );
      if (annotation) {
        const property = {
          x: "left",
          y: "top",
          width: "width",
          height: "height",
        }[input.dataset.boundField];
        annotation.style[property] = `${Number(input.value)}%`;
      }
    });
  }
  const confidenceInput = outlet.querySelector("[data-confirm-confidence]");
  confidenceInput?.addEventListener("change", async () => {
    const next = await persistPartEdit(context, selected.id, {
      confirmed: confidenceInput.checked,
    });
    outlet.querySelector("[data-confirm-parts]").disabled = !canConfirmParts(next);
  });
  outlet
    .querySelector("[data-confirm-parts]")
    ?.addEventListener("click", () => confirmParts(context, route));
}

function renderReady(context) {
  const { outlet, app } = context;
  const project = app.getProject();
  const parts = project.confirmedParts || [];
  outlet.innerHTML = screenFrame(`
    <article class="route-screen ready-screen">
      <header class="screen-heading">
        <h1>Yep — you can build it!</h1>
        <p>Your parts are a match for ${escapeHtml(ideaText(project.idea))}.</p>
      </header>

      <section class="paper-panel ready-photo-panel" aria-label="Ready project inventory">
        <img class="parts-photo" data-source-photo alt="Your uploaded parts" />
        <div class="annotation-layer">
          ${parts.map((part, index) => readyAnnotation(part, index)).join("")}
        </div>
      </section>

      <ul class="ready-inventory" aria-label="Confirmed parts">
        ${parts
          .map(
            (part) => `
              <li>
                <span class="success-check">${icon("check")}</span>
                <span>${escapeHtml(part.name)}</span>
              </li>
            `,
          )
          .join("")}
      </ul>

      <div class="ready-action">
        <p class="annotation-note">Next, we’ll connect one piece at a time.</p>
        <a class="primary-button" href="/build/assemble">
          Show me how
          ${icon("arrow-right")}
        </a>
      </div>
    </article>
  `);
  hydrateStoredImage(context, "source", outlet.querySelector("[data-source-photo]"));
}

function renderMissing(context) {
  const { outlet, app } = context;
  const project = app.getProject();
  const feasibility = project.feasibility || {};
  const parts = project.confirmedParts || [];
  const missingParts = feasibility.missingParts || [];
  const availableAlternatives = inventoryCompatibleAlternatives(
    feasibility.alternatives || [],
    parts,
  );
  const missingCount = missingParts.filter(({ obtained }) => !obtained).length;
  outlet.innerHTML = screenFrame(`
    <article class="route-screen missing-screen">
      <header class="screen-heading missing-heading">
        <h1>Almost! You’re missing ${missingCount} ${
          missingCount === 1 ? "part" : "parts"
        }.</h1>
        <p>${escapeHtml((feasibility.reasons || []).join(" "))}</p>
      </header>

      <div class="feasibility-columns">
        <section class="paper-panel inventory-panel" aria-labelledby="have-title">
          <h2 id="have-title">You have</h2>
          <img class="inventory-photo" data-source-photo alt="Your uploaded parts" />
          <ul>
            ${parts
              .map(
                (part) => `
                  <li>
                    <span>${escapeHtml(part.name)}</span>
                    <span class="success-check">${icon("check")}</span>
                  </li>
                `,
              )
              .join("")}
          </ul>
        </section>

        <section class="paper-panel needed-panel" aria-labelledby="need-title">
          <h2 id="need-title">Still need</h2>
          <ul class="missing-list">
            ${missingParts.map((part) => missingPartRow(part, parts)).join("")}
          </ul>
          <p class="compatibility-note">
            ${icon("sparkles")}
            We only suggest searches that match your confirmed parts.
          </p>
        </section>
      </div>

      ${
        availableAlternatives.length
          ? `
            <section class="alternatives" aria-labelledby="alternatives-title">
              <h2 id="alternatives-title">Or build something today</h2>
              <div class="alternative-grid">
                ${availableAlternatives.map(alternativeCard).join("")}
              </div>
            </section>
          `
          : ""
      }
    </article>
  `);
  hydrateStoredImage(context, "source", outlet.querySelector("[data-source-photo]"));
  for (const button of outlet.querySelectorAll("[data-obtain-part]")) {
    button.addEventListener("click", async () => {
      const current = app.getProject();
      const updatedMissing = (current.feasibility?.missingParts || []).map((part) =>
        part.id === button.dataset.obtainPart ? { ...part, obtained: true } : part,
      );
      await app.replaceProject({
        ...current,
        feasibility: {
          ...current.feasibility,
          missingParts: updatedMissing,
        },
      });
      renderMissing(context);
    });
  }
}

async function persistPartEdit(context, partId, patch) {
  const { app } = context;
  const next = updateDetectedPart(app.getProject().confirmedParts || [], partId, patch);
  await app.updateProject("confirmedParts", next);
  return next;
}

async function confirmParts(context, route) {
  const { outlet, app } = context;
  const status = outlet.querySelector("[data-review-status]");
  const button = outlet.querySelector("[data-confirm-parts]");
  const confirmedParts = app.getProject().confirmedParts || [];
  if (!canConfirmParts(confirmedParts)) return;
  button.disabled = true;
  status.textContent = "Regenerating your guide and firmware…";
  try {
    const plan = await requestHardwarePlan({
      idea: ideaText(app.getProject().idea),
      confirmedParts,
    });
    await app.updateProject("confirmedParts", confirmedParts);
    await app.updateProject("feasibility", feasibilityRecord(plan));
    await app.updateProject("wiring", { steps: plan.wiringSteps });
    await app.updateProject("firmware", plan.firmware);
    await app.completeRoute(route.path);
    app.navigation.navigate(
      plan.feasibility.status === "missing"
        ? "/build/feasibility/missing"
        : "/build/feasibility/ready",
    );
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function hydrateStoredImage(context, imageId, image) {
  if (!image) return;
  try {
    if (!context.runtime.photoUrl) {
      const blob = await context.app.loadImage(imageId);
      if (!blob) return;
      context.runtime.photoUrl = URL.createObjectURL(blob);
    }
    image.src = context.runtime.photoUrl;
  } catch {
    image.removeAttribute("src");
  }
}

async function toggleVoice(context, textarea) {
  if (context.runtime.voice) {
    stopVoice(context);
    return;
  }
  const status = context.outlet.querySelector("[data-voice-status]");
  const button = context.outlet.querySelector("[data-voice-button]");
  status.textContent = "Getting ready…";
  button.disabled = true;
  try {
    const tokenResponse = await fetch("/api/deepgram/token", { method: "POST" });
    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(tokenPayload.error || "Voice is unavailable.");
    }
    const url = new URL("wss://api.deepgram.com/v1/listen");
    url.searchParams.set("model", "nova-3");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("interim_results", "true");
    url.searchParams.set("endpointing", "500");
    const socket = new WebSocket(url, ["token", tokenPayload.access_token]);
    const voice = { socket, recorder: null, stream: null };
    context.runtime.voice = voice;
    socket.onopen = async () => {
      try {
        voice.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        voice.recorder = new MediaRecorder(voice.stream, { mimeType });
        voice.recorder.ondataavailable = async (event) => {
          if (event.data.size && socket.readyState === 1) {
            socket.send(await event.data.arrayBuffer());
          }
        };
        voice.recorder.start(250);
        status.textContent = "Listening…";
        button.disabled = false;
      } catch (error) {
        status.textContent = error.message;
        stopVoice(context);
      }
    };
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      const transcript = message.channel?.alternatives?.[0]?.transcript?.trim();
      if (!transcript) return;
      status.textContent = transcript;
      if (message.is_final || message.speech_final) {
        textarea.value = [textarea.value.trim(), transcript].filter(Boolean).join(" ");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    socket.onerror = () => {
      status.textContent = "Voice paused. Try again.";
      button.disabled = false;
    };
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
    context.runtime.voice = null;
  }
}

function stopVoice(context) {
  const voice = context.runtime.voice;
  if (!voice) return;
  try {
    if (voice.socket?.readyState === 1) {
      voice.socket.send(JSON.stringify({ type: "Finalize" }));
      voice.socket.send(JSON.stringify({ type: "CloseStream" }));
    }
  } catch {
    // Best-effort finalization.
  }
  voice.recorder?.stop();
  voice.stream?.getTracks().forEach((track) => track.stop());
  voice.socket?.close();
  context.runtime.voice = null;
}

function feasibilityRecord(plan) {
  return {
    status: plan.feasibility.status,
    reasons: plan.feasibility.reasons,
    projectTitle: plan.projectTitle,
    summary: plan.summary,
    missingParts: plan.missingParts,
    alternatives: plan.alternatives,
    diagnostics: plan.diagnostics,
    firmwareSpec: plan.firmwareSpec,
  };
}

function screenFrame(content) {
  return `
    <h1 class="visually-hidden" id="makeable-heading" data-app-heading>${PRODUCT_NAME}</h1>
    <p class="visually-hidden" id="appStatus" role="status" aria-live="polite">${APP_READY_MESSAGE}</p>
    ${content}
  `;
}

function annotationButton(part, index, selectedId) {
  if (!part.bounds) return "";
  const { x, y, width, height } = part.bounds;
  return `
    <button
      class="part-annotation color-${(index % 5) + 1} ${
        selectedId === part.id ? "is-selected" : ""
      }"
      type="button"
      data-select-part="${escapeAttribute(part.id)}"
      aria-label="${escapeAttribute(part.name)} annotation, ${Math.round(
        part.confidence * 100,
      )}% confidence"
      style="left:${x}%;top:${y}%;width:${width}%;height:${height}%"
    >
      <span>${index + 1}</span>
      <strong>${escapeHtml(part.name)}</strong>
    </button>
  `;
}

function readyAnnotation(part, index) {
  if (!part.bounds) return "";
  const { x, y, width, height } = part.bounds;
  return `
    <div
      class="ready-annotation color-${(index % 5) + 1}"
      style="left:${x}%;top:${y}%;width:${width}%;height:${height}%"
    >
      <span>${index + 1}</span>
      <strong>${escapeHtml(part.name)}</strong>
      ${icon("check")}
    </div>
  `;
}

function partChip(part, index, selectedId) {
  return `
    <li class="part-chip ${selectedId === part.id ? "is-selected" : ""}">
      <button type="button" data-select-part="${escapeAttribute(part.id)}">
        <span class="part-number color-${(index % 5) + 1}">${index + 1}</span>
        <span>${escapeHtml(part.name)}</span>
      </button>
      <button
        class="icon-button"
        type="button"
        data-delete-part="${escapeAttribute(part.id)}"
        aria-label="Delete ${escapeAttribute(part.name)}"
      >${icon("x")}</button>
    </li>
  `;
}

function partInspector(part) {
  const bounds = part.bounds || { x: 0, y: 0, width: 0, height: 0 };
  return `
    <fieldset class="part-inspector">
      <legend>Edit selected part</legend>
      <label>
        <span>Part name</span>
        <input data-part-name value="${escapeAttribute(part.name)}" />
      </label>
      <div class="bounds-grid">
        ${boundInput("Left edge", "x", bounds.x)}
        ${boundInput("Top edge", "y", bounds.y)}
        ${boundInput("Width", "width", bounds.width)}
        ${boundInput("Height", "height", bounds.height)}
      </div>
      ${
        part.lowConfidence
          ? `
            <label class="confidence-check">
              <input
                type="checkbox"
                data-confirm-confidence
                ${part.confirmed ? "checked" : ""}
                aria-label="Confirm ${escapeAttribute(part.name)} despite low confidence"
              />
              <span>Yes, this is ${escapeHtml(part.name)}</span>
            </label>
          `
          : `<p class="confidence-value">${Math.round(
              part.confidence * 100,
            )}% confident</p>`
      }
    </fieldset>
  `;
}

function boundInput(label, field, value) {
  return `
    <label>
      <span>${label}</span>
      <input
        type="number"
        min="0"
        max="100"
        step="1"
        value="${value}"
        data-bound-field="${field}"
        aria-label="${label}"
      />
    </label>
  `;
}

function missingPartRow(part, inventory) {
  return `
    <li class="${part.obtained ? "is-obtained" : ""}">
      <div>
        <h3>${escapeHtml(part.name)}</h3>
        <p>${escapeHtml(part.reason)}</p>
      </div>
      <div class="missing-actions">
        ${
          part.obtained
            ? `<span class="obtained-label">${icon("check")}Obtained</span>`
            : `
              <a
                class="secondary-button"
                href="${escapeAttribute(createPartSearchUrl(part, inventory))}"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Search for ${escapeAttribute(part.name)}"
              >Search</a>
              <button
                class="secondary-button"
                type="button"
                data-obtain-part="${escapeAttribute(part.id)}"
                aria-label="Mark ${escapeAttribute(part.name)} as obtained"
              >I got this</button>
            `
        }
      </div>
    </li>
  `;
}

function alternativeCard(alternative, index) {
  return `
    <article class="alternative-note color-${(index % 5) + 1}">
      ${icon(index % 2 ? "play" : "sparkles")}
      <div>
        <h3>${escapeHtml(alternative.title)}</h3>
        <p>${escapeHtml(alternative.summary)}</p>
      </div>
    </article>
  `;
}

function icon(name, className = "") {
  return `<img class="ui-icon ${className}" src="/assets/icons/lucide/${name}.svg" alt="" width="24" height="24" aria-hidden="true" />`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function escapeSelectorValue(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
