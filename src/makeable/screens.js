import {
  acquireMissingPart,
  advanceAssembly,
  blobToDataUrl,
  calculateContainedImageFrame,
  canConfirmParts,
  compileAndFlashFirmware,
  createProjectArtifacts,
  createProjectZip,
  createDiagnosticSession,
  createObjectUrlRegistry,
  createPartSearchUrl,
  evaluateManualTest,
  ideaText,
  inventoryCompatibleAlternatives,
  isAssemblyComplete,
  normalizeImageFile,
  requestHardwarePlan,
  recoverySecretForRepository,
  runSequentialDiagnostics,
  sharePublishedProject,
  selectAssemblyStep,
  transitionFirmwareFlash,
  updateDetectedPart,
  publishProjectArtifacts,
  validateRepositoryName,
} from "./actions.js";
import { APP_READY_MESSAGE, PRODUCT_NAME } from "./content.js";

const ROUTE_RENDERERS = Object.freeze({
  "/build/new": renderDescribe,
  "/build/parts/upload": renderUpload,
  "/build/parts/review": renderReview,
  "/build/feasibility/ready": renderReady,
  "/build/feasibility/missing": renderMissing,
  "/build/assemble": renderAssemble,
  "/build/code": renderCode,
  "/build/test/automatic": renderAutomaticTest,
  "/build/test/manual": renderManualTest,
  "/build/publish/connect": renderPublish,
  "/build/publish/success": renderPublishSuccess,
});

export function createScreenRenderer({ root, app }) {
  const outlet = root.querySelector("[data-screen-outlet]");
  if (!outlet) return Object.freeze({ render() {} });
  const windowLike = root.defaultView;
  const runtime = {
    voice: null,
    cameraStream: null,
    evidence: null,
    operationAbort: null,
    serialSession: null,
    cameraRequest: null,
    routeGeneration: 0,
    hardware: windowLike.MAKEABLE_HARDWARE || {
      compileAndFlashFirmware,
      createDiagnosticSession,
    },
    currentRoute: null,
    imageObservers: new Map(),
    objectUrls: createObjectUrlRegistry({
      createObjectURL: windowLike.URL.createObjectURL.bind(windowLike.URL),
      revokeObjectURL: windowLike.URL.revokeObjectURL.bind(windowLike.URL),
    }),
  };
  let destroyed = false;
  const context = {
    root,
    window: windowLike,
    outlet,
    app,
    runtime,
    render(route) {
      cleanupRouteResources(context);
      runtime.routeGeneration += 1;
      runtime.currentRoute = route;
      for (const observer of runtime.imageObservers.values()) observer.disconnect();
      runtime.imageObservers.clear();
      const renderer = ROUTE_RENDERERS[route.path];
      if (!renderer) return;
      renderer(context, route);
    },
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopVoice(context);
    cleanupRouteResources(context);
    for (const observer of runtime.imageObservers.values()) observer.disconnect();
    runtime.imageObservers.clear();
    runtime.objectUrls.revokeAll();
    windowLike.removeEventListener("pagehide", destroy);
  };
  windowLike.addEventListener("pagehide", destroy);
  return Object.freeze({ render: context.render, destroy });
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
      revision:
        context.window.crypto?.randomUUID?.() ||
        `${Date.now()}-${normalized.blob.size}`,
    });
    progress.textContent = "Looking closely at your parts…";
    const plan = await requestHardwarePlan({
      idea: ideaText(app.getProject().idea),
      imageDataUrl: await blobToDataUrl(normalized.blob),
    });
    await persistReviewSelection(context, null);
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
  const { outlet, app } = context;
  const project = app.getProject();
  const parts = project.confirmedParts || [];
  const selectedId = project.review?.selectedPartId || null;
  const selected = parts.find(({ id }) => id === selectedId) || null;
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
  hydrateStoredImage(
    context,
    "source",
    outlet.querySelector("[data-source-photo]"),
    outlet.querySelector(".annotation-layer"),
  );

  for (const button of outlet.querySelectorAll("[data-select-part]")) {
    button.addEventListener("click", async () => {
      await persistReviewSelection(context, button.dataset.selectPart);
      renderReview(context, route);
    });
  }
  for (const button of outlet.querySelectorAll("[data-delete-part]")) {
    button.addEventListener("click", async () => {
      const next = (app.getProject().confirmedParts || []).filter(
        ({ id }) => id !== button.dataset.deletePart,
      );
      await app.updateProject("confirmedParts", next);
      await persistReviewSelection(context, next.at(0)?.id || null);
      renderReview(context, route);
    });
  }
  const nameInput = outlet.querySelector("[data-part-name]");
  nameInput?.addEventListener("change", async () => {
    await persistPartEdit(context, selected.id, { name: nameInput.value });
    renderReview(context, route);
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
      renderReview(context, route);
    });
  }
  const confidenceInput = outlet.querySelector("[data-confirm-confidence]");
  confidenceInput?.addEventListener("change", async () => {
    await persistPartEdit(context, selected.id, {
      confirmed: confidenceInput.checked,
    });
    renderReview(context, route);
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
        <a class="primary-button" href="/build/assemble" data-start-assembly>
          Show me how
          ${icon("arrow-right")}
        </a>
      </div>
    </article>
  `);
  hydrateStoredImage(
    context,
    "source",
    outlet.querySelector("[data-source-photo]"),
    outlet.querySelector(".annotation-layer"),
  );
  outlet.querySelector("[data-start-assembly]").addEventListener("click", async (event) => {
    event.preventDefault();
    await app.completeRoute("/build/feasibility/ready");
    app.navigation.navigate("/build/assemble");
  });
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
      const updated = acquireMissingPart(current, button.dataset.obtainPart);
      await app.replaceProject(updated);
      if (updated.feasibility?.status === "ready") {
        app.navigation.navigate("/build/feasibility/ready");
      } else {
        renderMissing(context);
      }
    });
  }
}

function renderAssemble(context, route) {
  const { outlet, app } = context;
  const project = app.getProject();
  const wiring = {
    ...(project.wiring || {}),
    steps: project.wiring?.steps || [],
    currentStep: Number.isInteger(project.wiring?.currentStep)
      ? project.wiring.currentStep
      : 0,
    completedSteps: project.wiring?.completedSteps || [],
  };
  const steps = wiring.steps;
  const currentIndex = Math.min(
    Math.max(0, wiring.currentStep),
    Math.max(0, steps.length - 1),
  );
  const step = steps[currentIndex];
  if (!step) {
    outlet.innerHTML = screenFrame(`
      <article class="route-screen assembly-screen">
        <header class="screen-heading">
          <h1>Your connection guide needs another look.</h1>
          <p>No safe wiring steps were generated. Return to your confirmed parts and regenerate the guide.</p>
        </header>
        <a class="secondary-button" href="/build/parts/review">Back to my parts</a>
      </article>
    `);
    return;
  }
  const fromPart = project.confirmedParts?.find(
    ({ id }) => id === step.fromPartId,
  );
  const toPart = project.confirmedParts?.find(({ id }) => id === step.toPartId);
  outlet.innerHTML = screenFrame(`
    <article class="route-screen assembly-screen">
      <header class="screen-heading assembly-heading">
        <h1>Step ${currentIndex + 1} of ${steps.length}: ${escapeHtml(step.title)}</h1>
      </header>

      <ol class="connection-progress" aria-label="Assembly connections">
        ${steps
          .map(
            (_entry, index) => `
              <li>
                <button
                  type="button"
                  data-assembly-step="${index}"
                  aria-label="Connection ${index + 1}"
                  aria-current="${index === currentIndex ? "step" : "false"}"
                  ${
                    index <= firstIncompleteAssemblyStep(wiring)
                      ? ""
                      : "disabled"
                  }
                >
                  ${wiring.completedSteps.includes(index) ? icon("check") : index + 1}
                </button>
              </li>
            `,
          )
          .join("")}
      </ol>

      <div class="assembly-layout">
        <section class="paper-panel assembly-photo-panel" aria-label="Current connection on your uploaded photo">
          <img
            class="parts-photo"
            data-source-photo
            alt="Your uploaded parts with this connection highlighted"
          />
          <div class="annotation-layer">
            ${connectionAnnotation(fromPart, step.from || "From", "from")}
            ${connectionAnnotation(toPart, step.to || "To", "to")}
          </div>
          <div class="connection-caption">
            <strong>${escapeHtml(step.pin || `${step.from} to ${step.to}`)}</strong>
            <span>${escapeHtml(step.wireColor || "matching")} wire</span>
          </div>
        </section>

        <div class="assembly-notes">
          <section class="sticky-note" aria-labelledby="why-title">
            <h2 id="why-title">Why?</h2>
            <p>${escapeHtml(step.explanation || step.instruction)}</p>
          </section>
          <section class="paper-panel watch-card">
            <button type="button" class="watch-button" data-watch-connection aria-pressed="false">
              ${icon("play")}
              Watch this move.
            </button>
            <p>This animates the labels on your photo. It is not live camera footage.</p>
          </section>
        </div>
      </div>

      <section class="connection-instruction" aria-labelledby="connection-title">
        <h2 id="connection-title">${escapeHtml(step.instruction)}</h2>
        <p><strong>Quick check:</strong> ${escapeHtml(step.check)}</p>
      </section>

      <div class="assembly-actions">
        <button class="secondary-button" type="button" data-assembly-back>
          ${icon("arrow-left")} Back
        </button>
        <button class="primary-button" type="button" data-complete-connection>
          I connected it
        </button>
      </div>
    </article>
  `);
  hydrateStoredImage(
    context,
    "source",
    outlet.querySelector("[data-source-photo]"),
    outlet.querySelector(".annotation-layer"),
  );
  for (const button of outlet.querySelectorAll("[data-assembly-step]")) {
    button.addEventListener("click", async () => {
      const updated = selectAssemblyStep(
        app.getProject().wiring,
        Number(button.dataset.assemblyStep),
      );
      await persistWiringProgress(app, updated);
      renderAssemble(context, route);
    });
  }
  outlet.querySelector("[data-watch-connection]").addEventListener("click", (event) => {
    const panel = outlet.querySelector(".assembly-photo-panel");
    panel.classList.remove("is-animating");
    void panel.offsetWidth;
    panel.classList.add("is-animating");
    event.currentTarget.setAttribute("aria-pressed", "true");
    context.window.setTimeout(() => {
      panel.classList.remove("is-animating");
      event.currentTarget?.setAttribute("aria-pressed", "false");
    }, 900);
  });
  outlet.querySelector("[data-assembly-back]").addEventListener("click", async () => {
    if (currentIndex === 0) {
      app.navigation.navigate("/build/feasibility/ready");
      return;
    }
    await persistWiringProgress(app, selectAssemblyStep(wiring, currentIndex - 1));
    renderAssemble(context, route);
  });
  outlet
    .querySelector("[data-complete-connection]")
    .addEventListener("click", async () => {
      const updated = advanceAssembly(app.getProject().wiring);
      await persistWiringProgress(app, updated);
      if (isAssemblyComplete(updated)) {
        await app.completeRoute(route.path);
        app.navigation.navigate("/build/code");
      } else {
        renderAssemble(context, route);
      }
    });
}

function renderCode(context, route) {
  const { outlet, app, window: windowLike } = context;
  const project = app.getProject();
  const firmware = project.firmware || {};
  const detectedBoard =
    firmware.flash?.status === "success" ? firmware.flash?.boardName : "";
  const configuredBoard =
    project.feasibility?.firmwareSpec?.board ||
    windowLike.MAKEABLE_CONFIG?.arduinoFqbn ||
    "esp32:esp32:esp32";
  const configuredFqbn =
    firmware.flash?.fqbn ||
    windowLike.MAKEABLE_CONFIG?.arduinoFqbn ||
    "esp32:esp32:esp32";
  outlet.innerHTML = screenFrame(`
    <article class="route-screen code-screen">
      <header class="screen-heading code-heading">
        <h1>Your build is wired. Let’s give it a brain.</h1>
      </header>

      <div class="code-layout">
        <section class="paper-panel firmware-panel" aria-labelledby="firmware-title">
          <h2 class="visually-hidden" id="firmware-title">Generated firmware</h2>
          <div class="code-tabs" role="tablist" aria-label="Firmware view">
            <button type="button" role="tab" aria-selected="true" data-code-view="simple">Simple view</button>
            <button type="button" role="tab" aria-selected="false" data-code-view="advanced">Advanced view</button>
          </div>
          <pre class="firmware-code" data-simple-code><code>${escapeHtml(
            firmware.sketch || "Firmware generation is still pending.",
          )}</code></pre>
          <label class="visually-hidden" for="firmware-editor">Firmware code</label>
          <textarea
            id="firmware-editor"
            class="firmware-editor"
            data-advanced-code
            aria-label="Firmware code"
            spellcheck="false"
            hidden
          >${escapeHtml(firmware.sketch || "")}</textarea>
          <div class="firmware-tools">
            <button class="tool-button" type="button" data-copy-code>${icon("paperclip")} Copy</button>
            <button class="tool-button" type="button" data-download-code>${icon("download")} Download</button>
          </div>
          <aside class="sticky-note code-note">${escapeHtml(
            firmware.notes ||
              project.feasibility?.firmwareSpec?.behavior ||
              "Review the wiring before you load the code.",
          )}</aside>
        </section>

        <section class="board-panel" aria-labelledby="connect-title">
          <h2 id="connect-title">Connect your board</h2>
          <ol class="board-steps">
            <li><span>1</span>Plug the USB cable into your computer.</li>
            <li><span>2</span>Plug the other end into your board.</li>
            <li><span>3</span>Your board should light up.</li>
          </ol>
          ${
            detectedBoard
              ? `
                <p class="board-found" data-board-found>
                  <span aria-hidden="true"></span>
                  Board found: ${escapeHtml(detectedBoard)}
                </p>
              `
              : `
                <p class="configured-board configured-board--status">
                  Configured board: ${escapeHtml(configuredBoard)}
                </p>
              `
          }
          <p class="configured-board">Board target: <code>${escapeHtml(
            configuredFqbn,
          )}</code></p>
          <p class="hardware-status" data-hardware-status role="status" aria-live="polite">
            Checking the local Arduino setup…
          </p>
          <label class="erase-option">
            <input type="checkbox" data-erase-flash />
            Erase the board before loading
          </label>
          <button class="primary-button" type="button" data-flash-board>
            Load code to my board
          </button>
          <button class="secondary-button cancel-operation" type="button" data-cancel-flash hidden>
            Cancel loading
          </button>
          <p class="safety-note">${icon("circle-alert")}Keep moving parts clear while we upload.</p>
        </section>
      </div>

      <section class="load-progress" aria-label="Firmware loading progress">
        <div>
          <span data-progress-label>${
            firmware.flash?.status === "success" ? "Code loaded" : "Ready to load"
          }</span>
          <span data-progress-value>${
            firmware.flash?.status === "success" ? "100%" : "0%"
          }</span>
        </div>
        <progress data-flash-progress max="100" value="${
          firmware.flash?.status === "success" ? "100" : "0"
        }">0%</progress>
      </section>
    </article>
  `);

  const editor = outlet.querySelector("[data-advanced-code]");
  const simple = outlet.querySelector("[data-simple-code]");
  for (const tab of outlet.querySelectorAll("[data-code-view]")) {
    tab.addEventListener("click", () => {
      const advanced = tab.dataset.codeView === "advanced";
      simple.hidden = advanced;
      editor.hidden = !advanced;
      for (const candidate of outlet.querySelectorAll("[data-code-view]")) {
        candidate.setAttribute(
          "aria-selected",
          String(candidate === tab),
        );
      }
      if (advanced) editor.focus();
    });
  }
  editor.addEventListener("change", async () => {
    const current = app.getProject().firmware || {};
    await app.updateProject("firmware", {
      language: current.language || "Arduino C++",
      sketch: editor.value,
      notes: current.notes || "",
    });
    simple.querySelector("code").textContent = editor.value;
    outlet.querySelector("[data-progress-label]").textContent = "Ready to load";
    outlet.querySelector("[data-progress-value]").textContent = "0%";
    outlet.querySelector("[data-flash-progress]").value = 0;
  });
  outlet.querySelector("[data-copy-code]").addEventListener("click", async (event) => {
    try {
      await windowLike.navigator.clipboard.writeText(editor.value);
      event.currentTarget.lastChild.textContent = " Copied";
    } catch {
      outlet.querySelector("[data-hardware-status]").textContent =
        "Copy is blocked in this browser. Select the code in Advanced view.";
    }
  });
  outlet.querySelector("[data-download-code]").addEventListener("click", () => {
    downloadFirmware(context, editor.value);
  });
  outlet.querySelector("[data-cancel-flash]").addEventListener("click", () => {
    context.runtime.operationAbort?.abort();
  });
  outlet.querySelector("[data-flash-board]").addEventListener("click", () =>
    flashCurrentFirmware(context, route, editor.value, configuredFqbn),
  );
  refreshArduinoSetup(context);
}

function renderAutomaticTest(context, route) {
  const { outlet, app } = context;
  const project = app.getProject();
  const diagnostics = project.feasibility?.diagnostics?.tests || [];
  const previous = project.tests?.automatic;
  const checks =
    previous?.checks?.length === diagnostics.length
      ? previous.checks
      : diagnostics.map((check) => ({ ...check, status: "waiting", detail: "" }));
  const passed = previous?.status === "pass";
  outlet.innerHTML = screenFrame(`
    <article class="route-screen automatic-test-screen">
      <header class="screen-heading test-heading">
        <div>
          <h1>Test 1 of 2: I’ll check the hardware</h1>
          <p>Keep everything plugged in. I’ll run each safe check one at a time.</p>
        </div>
        <aside class="sticky-note">Actuators only receive a short pulse of 1 second or less.</aside>
      </header>

      <div class="test-stage-tabs" aria-label="Test progress">
        <span aria-current="step"><strong>1</strong> Automatic check</span>
        <button type="button" data-your-turn ${passed ? "" : "disabled"}><strong>2</strong> Your turn</button>
      </div>

      <div class="automatic-layout">
        <section class="paper-panel test-photo-panel" aria-label="Your assembled project">
          <img class="parts-photo" data-source-photo alt="Your uploaded project ready for hardware checks" />
          <div class="annotation-layer">
            ${(project.confirmedParts || [])
              .filter(({ bounds }) => bounds)
              .map((part, index) => readyAnnotation(part, index))
              .join("")}
          </div>
          <p class="detected-test-board">Board found: ${escapeHtml(
            project.firmware?.flash?.boardName || "connected ESP32",
          )}</p>
        </section>

        <section class="paper-panel status-panel" aria-labelledby="status-title">
          <h2 class="visually-hidden" id="status-title">Automatic check status</h2>
          <ol class="diagnostic-statuses" data-diagnostic-statuses>
            ${checks.map(diagnosticStatusRow).join("")}
          </ol>
          <p class="test-count" data-test-count>${checks.filter(({ status }) => status === "pass").length} of ${checks.length}</p>
        </section>
      </div>

      <section class="paper-panel test-progress-panel">
        <div>
          <p data-automatic-message role="status" aria-live="polite">${
            passed
              ? `Hardware check passed · ${checks.length} of ${checks.length}`
              : diagnostics.length
                ? "Ready for the automatic check."
                : "No stable diagnostic plan is available. Regenerate the guide before testing."
          }</p>
          <progress data-test-progress max="${Math.max(1, checks.length)}" value="${
            checks.filter(({ status }) => status === "pass").length
          }"></progress>
        </div>
        <button class="primary-button" type="button" data-start-test ${
          diagnostics.length && !passed ? "" : "disabled"
        }>Start automatic check</button>
        <button class="secondary-button" type="button" data-stop-test hidden>Stop test</button>
      </section>
    </article>
  `);
  hydrateStoredImage(
    context,
    "source",
    outlet.querySelector("[data-source-photo]"),
    outlet.querySelector(".annotation-layer"),
  );
  attachRepairLinks(context);
  outlet.querySelector("[data-start-test]").addEventListener("click", () =>
    startAutomaticTest(context, route, diagnostics),
  );
  outlet.querySelector("[data-stop-test]").addEventListener("click", async () => {
    context.runtime.operationAbort?.abort();
    await context.runtime.serialSession?.close?.();
  });
  outlet.querySelector("[data-your-turn]").addEventListener("click", async () => {
    if (app.getProject().tests?.automatic?.status !== "pass") return;
    await app.completeRoute(route.path);
    app.navigation.navigate("/build/test/manual");
  });
}

function renderManualTest(context, route) {
  const { outlet, app } = context;
  const project = app.getProject();
  const diagnostics = project.feasibility?.diagnostics || {};
  const action =
    diagnostics.manualAction ||
    project.feasibility?.firmwareSpec?.behavior ||
    "Perform the project’s real-world action and watch what happens.";
  const question = diagnostics.manualQuestion || "Did the project respond as expected?";
  const yesLabel = diagnostics.manualSuccessLabel || "Yes, it worked";
  const actionSteps = manualActionSteps(action);
  const automaticCount = project.tests?.automatic?.checks?.length || 0;
  outlet.innerHTML = screenFrame(`
    <article class="route-screen manual-test-screen">
      <header class="screen-heading test-heading">
        <div>
          <h1>Test 2 of 2: Your turn</h1>
          <p>Let’s make sure it works in the real world.</p>
        </div>
        <p class="automatic-pass-note">Hardware check passed · ${automaticCount} of ${automaticCount}</p>
      </header>

      <div class="test-stage-tabs" aria-label="Test progress">
        <span><strong>1</strong> Automatic check ${icon("check")}</span>
        <span aria-current="step"><strong>2</strong> Your turn</span>
      </div>

      <section class="paper-panel manual-action-panel" aria-labelledby="manual-action-title">
        <h2 class="visually-hidden" id="manual-action-title">${escapeHtml(action)}</h2>
        <ol>
          ${actionSteps
            .map(
              (instruction, index) => `
                <li>
                  <span>${index + 1}</span>
                  <p>${escapeHtml(instruction)}</p>
                  ${
                    index === actionSteps.length - 1
                      ? `
                        <video data-camera-preview playsinline muted aria-label="Live camera preview"></video>
                        <div class="camera-actions">
                          <button class="secondary-button" type="button" data-start-camera>${icon("camera")} Start camera</button>
                          <button class="secondary-button" type="button" data-capture-evidence disabled>Capture evidence</button>
                        </div>
                      `
                      : ""
                  }
                </li>
              `,
            )
            .join("")}
        </ol>
        <p class="evidence-status" data-evidence-status role="status" aria-live="polite">
          Point the camera at the behavior you want to confirm.
        </p>
      </section>

      <section class="paper-panel manual-answer-panel" aria-labelledby="manual-question">
        <h2 id="manual-question">${escapeHtml(question)}</h2>
        <div>
          <button class="primary-button" type="button" data-manual-yes>${escapeHtml(
            yesLabel,
          )}</button>
          <button class="manual-not-yet" type="button" data-manual-not-yet>Not yet — help me fix it</button>
        </div>
        <div class="repair-guidance" data-repair-guidance role="status" aria-live="polite"></div>
      </section>
    </article>
  `);
  outlet.querySelector("[data-start-camera]").addEventListener("click", () =>
    startManualCamera(context),
  );
  outlet.querySelector("[data-capture-evidence]").addEventListener("click", () =>
    captureManualEvidence(context),
  );
  outlet.querySelector("[data-manual-yes]").addEventListener("click", () =>
    acknowledgeManualTest(context, route, {
      action,
      acknowledged: true,
    }),
  );
  outlet.querySelector("[data-manual-not-yet]").addEventListener("click", () =>
    acknowledgeManualTest(context, route, {
      action,
      acknowledged: false,
    }),
  );
}

function renderPublish(context, route) {
  const { outlet, app } = context;
  const project = app.getProject();
  const title =
    project.feasibility?.projectTitle || "Makeable Project";
  const repositoryName =
    project.publish?.repositoryName || repositoryNameFromTitle(title);
  const artifacts = createProjectArtifacts(project);
  const defaultVisibility =
    project.publish?.visibility === "private" ? "private" : "public";
  outlet.innerHTML = screenFrame(`
    <article class="route-screen publish-screen">
      <header class="screen-heading publish-heading">
        <div>
          <h1>You built it. Now share it.</h1>
          <p>Makeable will package your guide, code, parts list, and test results.</p>
        </div>
      </header>

      <section class="paper-panel publish-package">
        <form class="publish-form" data-publish-form novalidate>
          <div class="repository-row">
            <div class="repository-field">
              <label for="repository-name">Repository name</label>
              <input
                id="repository-name"
                name="repositoryName"
                type="text"
                maxlength="100"
                autocomplete="off"
                spellcheck="false"
                value="${escapeAttribute(repositoryName)}"
                aria-describedby="repository-error"
              />
              <p class="field-error" id="repository-error" data-repository-error role="status"></p>
            </div>
            <fieldset class="visibility-options">
              <legend class="visually-hidden">Repository visibility</legend>
              <label>
                <input type="radio" name="visibility" value="public" ${
                  defaultVisibility === "public" ? "checked" : ""
                } />
                <span>${icon("share-2")} Public</span>
              </label>
              <label>
                <input type="radio" name="visibility" value="private" ${
                  defaultVisibility === "private" ? "checked" : ""
                } />
                <span>${icon("circle-alert")} Private</span>
              </label>
            </fieldset>
          </div>

          <div class="artifact-inventory">
            <h2>This repository will include:</h2>
            <ul>
              ${artifacts
                .map(
                  ({ path }) => `
                    <li>
                      ${icon(path.endsWith(".ino") ? "code-xml" : path === "README.md" ? "paperclip" : "github")}
                      <span>${escapeHtml(artifactDisplayName(path))}</span>
                    </li>
                  `,
                )
                .join("")}
            </ul>
          </div>
        </form>

        <div class="publish-preview">
          <div class="publish-photo-frame">
            <img
              data-source-photo
              alt="Your finished Makeable project"
              width="640"
              height="480"
            />
          </div>
          <h2>${escapeHtml(title)}</h2>
          <span>Tested &amp; working</span>
        </div>
      </section>

      <div class="publish-ready-row" aria-label="Package contents ready">
        <span>${icon("check")} Build guide</span>
        <span>${icon("check")} Code</span>
        <span>${icon("check")} Parts list</span>
        <span>${icon("check")} Test results</span>
        <p>You can edit everything before it goes live.</p>
      </div>

      <div class="publish-actions">
        <button class="publish-github-button" type="button" data-publish-github>
          Connect GitHub &amp; publish
        </button>
        <button class="download-project-button" type="button" data-download-project>
          Download project instead
        </button>
        <p class="publish-status" data-publish-status role="status" aria-live="polite"></p>
      </div>
    </article>
  `);
  hydrateStoredImage(
    context,
    project.tests?.manual?.evidenceImageId || project.photo?.imageId || "source",
    outlet.querySelector("[data-source-photo]"),
  );

  const form = outlet.querySelector("[data-publish-form]");
  const input = outlet.querySelector("#repository-name");
  const error = outlet.querySelector("[data-repository-error]");
  const validate = () => {
    const result = validateRepositoryName(input.value);
    error.textContent = result.message;
    input.setAttribute("aria-invalid", String(!result.valid));
    return result;
  };
  input.addEventListener("input", validate);
  outlet.querySelector("[data-publish-github]").addEventListener("click", () =>
    publishFromScreen(context, route, form, validate),
  );
  outlet.querySelector("[data-download-project]").addEventListener("click", () =>
    downloadProjectArchive(context, repositoryNameFromTitle(input.value)),
  );
}

async function publishFromScreen(context, route, form, validate) {
  const { outlet, app, window } = context;
  const validation = validate();
  if (!validation.valid) {
    outlet.querySelector("#repository-name").focus();
    return;
  }
  const button = outlet.querySelector("[data-publish-github]");
  const status = outlet.querySelector("[data-publish-status]");
  if (!window.MAKEABLE_CONFIG?.hasGithubToken) {
    status.textContent =
      "GitHub publishing needs GITHUB_TOKEN on the Makeable server. You can still download the project.";
    return;
  }
  const visibility = new FormData(form).get("visibility") || "public";
  button.disabled = true;
  button.textContent = "Packaging your project…";
  status.textContent = "Creating the repository and uploading five project files…";
  try {
    const currentAuthorization = app.getProject().publishAuthorization;
    const recoverySecret = recoverySecretForRepository(
      currentAuthorization,
      validation.value,
      window.crypto,
    );
    if (recoverySecret !== currentAuthorization?.recoverySecret) {
      await app.updateProject("publishAuthorization", {
        repositoryName: validation.value,
        recoverySecret,
      });
    }
    const result = await publishProjectArtifacts({
      project: app.getProject(),
      repositoryName: validation.value,
      isPrivate: visibility === "private",
      configuredOwner: window.MAKEABLE_CONFIG?.githubOwner,
      recoverySecret,
      fetchImpl: window.fetch.bind(window),
    });
    await app.updateProject("publish", {
      ...result,
      publishedAt: new Date().toISOString(),
    });
    await app.completeRoute(route.path);
    app.navigation.navigate("/build/publish/success");
  } catch (error) {
    status.textContent = `I couldn’t publish yet: ${error.message}`;
    button.disabled = false;
    button.textContent = "Connect GitHub & publish";
  }
}

function downloadProjectArchive(context, repositoryName) {
  const artifacts = createProjectArtifacts(context.app.getProject());
  const blob = createProjectZip(artifacts);
  const key = artifacts.map(({ path, content }) => `${path}:${content.length}`).join("|");
  const url = context.runtime.objectUrls.replace("project-download", key, blob);
  const link = context.root.createElement("a");
  link.href = url;
  link.download = `${repositoryName || "makeable-project"}.zip`;
  link.click();
  context.outlet.querySelector("[data-publish-status]").textContent =
    "Your Makeable project ZIP is ready.";
}

function renderPublishSuccess(context) {
  const { outlet, app } = context;
  const project = app.getProject();
  const published = project.publish || {};
  const title = project.feasibility?.projectTitle || "Makeable Project";
  const owner = published.owner || context.window.MAKEABLE_CONFIG?.githubOwner || "";
  const repositoryName =
    published.repositoryName || repositoryNameFromTitle(title);
  const repositoryUrl =
    published.repositoryUrl ||
    `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(
      repositoryName,
    )}`;
  const visibility =
    published.visibility === "private" ? "Private" : "Public";
  outlet.innerHTML = screenFrame(`
    <article class="route-screen publish-success-screen">
      <header class="screen-heading publish-success-heading">
        <div>
          <h1>It’s live — you made hardware!</h1>
          <p>Your ${escapeHtml(title.toLowerCase())} is now a project you can share, remix, and improve.</p>
        </div>
      </header>

      <section class="paper-panel success-package">
        <div class="success-project-photo">
          <img
            data-source-photo
            alt="Your published Makeable project"
            width="640"
            height="480"
          />
          <span>Built with <strong>Makeable</strong></span>
        </div>

        <div class="success-project-details">
          <h2>${escapeHtml(owner)} / ${escapeHtml(repositoryName)}</h2>
          <span class="repository-visibility">${visibility}</span>
          <div class="repository-url-row">
            <a href="${escapeAttribute(repositoryUrl)}" target="_blank" rel="noreferrer">
              ${escapeHtml(repositoryUrl.replace(/^https?:\/\//, ""))}
            </a>
            <button type="button" data-copy-repository aria-label="Copy repository URL">
              ${icon("paperclip")}
            </button>
          </div>
          <ul class="publish-results">
            <li>${icon("check")} Guide uploaded</li>
            <li>${icon("check")} Code uploaded</li>
            <li>${icon("check")} Parts listed</li>
            <li>${icon("check")} Tests included</li>
          </ul>
          <a class="view-project-button" href="${escapeAttribute(
            repositoryUrl,
          )}" target="_blank" rel="noreferrer">View my GitHub project</a>
          <button class="share-project-button" type="button" data-share-project>
            ${icon("share-2")} Share project
          </button>
          <button class="start-another-button" type="button" data-start-another>
            Start another build
          </button>
          <p class="share-status" data-share-status role="status" aria-live="polite"></p>
        </div>
      </section>
    </article>
  `);
  hydrateStoredImage(
    context,
    project.tests?.manual?.evidenceImageId || project.photo?.imageId || "source",
    outlet.querySelector("[data-source-photo]"),
  );
  const status = outlet.querySelector("[data-share-status]");
  outlet.querySelector("[data-copy-repository]").addEventListener("click", async () => {
    try {
      await context.window.navigator.clipboard.writeText(repositoryUrl);
      status.textContent = "Repository link copied.";
    } catch {
      status.textContent = "Copy the repository link from the field above.";
    }
  });
  outlet.querySelector("[data-share-project]").addEventListener("click", async () => {
    try {
      const mode = await sharePublishedProject({
        repositoryUrl,
        title,
        navigatorLike: context.window.navigator,
      });
      status.textContent =
        mode === "shared"
          ? "Share sheet opened."
          : mode === "cancelled"
            ? "Sharing cancelled."
            : "Repository link copied.";
    } catch (error) {
      status.textContent = error.message;
    }
  });
  outlet.querySelector("[data-start-another]").addEventListener("click", async () => {
    await app.resetProject();
    app.navigation.navigate("/build/new", { replace: true });
  });
}

function cleanupRouteResources(context) {
  context.runtime.operationAbort?.abort();
  context.runtime.operationAbort = null;
  const session = context.runtime.serialSession;
  context.runtime.serialSession = null;
  session?.close?.().catch?.(() => {});
  context.runtime.cameraStream?.getTracks?.().forEach((track) => track.stop());
  context.runtime.cameraStream = null;
  if (context.runtime.cameraRequest) context.runtime.cameraRequest.cancelled = true;
  context.runtime.cameraRequest = null;
  context.runtime.evidence = null;
}

async function persistWiringProgress(app, wiring) {
  await app.replaceProject({
    ...app.getProject(),
    wiring,
    updatedAt: new Date().toISOString(),
  });
}

function firstIncompleteAssemblyStep(wiring) {
  const index = (wiring.steps || []).findIndex(
    (_step, candidate) => !(wiring.completedSteps || []).includes(candidate),
  );
  return index === -1 ? Math.max(0, (wiring.steps || []).length - 1) : index;
}

function connectionAnnotation(part, label, role) {
  if (!part?.bounds) return "";
  const { x, y, width, height } = part.bounds;
  return `
    <div
      class="connection-annotation connection-annotation--${role}"
      style="left:${x}%;top:${y}%;width:${width}%;height:${height}%"
    >
      <strong>${escapeHtml(label)}</strong>
    </div>
  `;
}

async function refreshArduinoSetup(context) {
  const statusNode = context.outlet.querySelector("[data-hardware-status]");
  const flashButton = context.outlet.querySelector("[data-flash-board]");
  if (!statusNode || !flashButton) return;
  try {
    const response = await context.window.fetch("/api/arduino/status");
    const status = await response.json();
    if (context.runtime.currentRoute?.path !== "/build/code") return;
    if (status.hostedMode) {
      statusNode.textContent =
        "Online guide mode is ready. Loading a physical ESP32 needs the local Makeable server.";
      flashButton.textContent = "Local app needed";
      flashButton.disabled = true;
      return;
    }
    if (status.hasArduinoCli && status.hasEsp32Core) {
      statusNode.textContent =
        "Arduino CLI and the ESP32 boards core are ready on this computer.";
      return;
    }
    statusNode.textContent =
      status.message ||
      "Arduino CLI or the ESP32 boards core is missing. Install it, then retry.";
  } catch (error) {
    statusNode.textContent = `I couldn’t check the local Arduino setup: ${error.message}`;
  }
}

async function flashCurrentFirmware(context, route, sketch, configuredFqbn) {
  const { outlet, app } = context;
  const button = outlet.querySelector("[data-flash-board]");
  const cancelButton = outlet.querySelector("[data-cancel-flash]");
  const statusNode = outlet.querySelector("[data-hardware-status]");
  const progress = outlet.querySelector("[data-flash-progress]");
  const progressLabel = outlet.querySelector("[data-progress-label]");
  const progressValue = outlet.querySelector("[data-progress-value]");
  const erase = outlet.querySelector("[data-erase-flash]").checked;
  if (!sketch.trim()) {
    statusNode.textContent = "There isn’t code to load yet.";
    return;
  }
  const controller = new AbortController();
  context.runtime.operationAbort = controller;
  button.disabled = true;
  button.textContent = "Loading code…";
  cancelButton.hidden = false;
  statusNode.textContent =
    "Choose your ESP32 when the browser asks. Nothing is marked successful until the loader finishes.";
  const boardFound = outlet.querySelector("[data-board-found]");
  if (boardFound) {
    const configuredBoard =
      app.getProject().feasibility?.firmwareSpec?.board ||
      context.window.MAKEABLE_CONFIG?.arduinoFqbn ||
      "esp32:esp32:esp32";
    boardFound.removeAttribute("data-board-found");
    boardFound.className = "configured-board configured-board--status";
    boardFound.textContent = `Configured board: ${configuredBoard}`;
  }
  try {
    await app.updateProject(
      "firmware",
      transitionFirmwareFlash(
        { ...(app.getProject().firmware || {}), sketch },
        "pending",
        {
          fqbn: configuredFqbn || "esp32:esp32:esp32",
        },
      ),
    );
    const result = await context.runtime.hardware.compileAndFlashFirmware({
      sketch,
      fqbn: configuredFqbn || "esp32:esp32:esp32",
      erase,
      serial: context.window.navigator.serial,
      fetchImpl: context.window.fetch.bind(context.window),
      signal: controller.signal,
      onProgress(event) {
        const percent = Math.min(100, Math.max(0, Number(event.percent) || 0));
        progress.value = percent;
        progress.textContent = `${percent}%`;
        progressLabel.textContent = event.label || "Loading code";
        progressValue.textContent = `${percent}%`;
      },
    });
    if (controller.signal.aborted) return;
    await app.updateProject(
      "firmware",
      transitionFirmwareFlash(app.getProject().firmware, "success", {
        boardName: result.boardName,
        fqbn: result.fqbn,
        flashedAt: new Date().toISOString(),
      }),
    );
    await app.completeRoute(route.path);
    app.navigation.navigate("/build/test/automatic");
  } catch (error) {
    const cancelled = controller.signal.aborted || error?.name === "AbortError";
    await app.updateProject(
      "firmware",
      transitionFirmwareFlash(
        app.getProject().firmware,
        cancelled ? "cancelled" : "failed",
        { error: error.message },
      ),
    );
    statusNode.textContent = cancelled
      ? "Loading stopped. The board was not marked as ready; retry when you’re ready."
      : `I couldn’t finish loading the board: ${error.message}`;
    progress.value = 0;
    progressLabel.textContent = cancelled ? "Stopped" : "Needs retry";
    progressValue.textContent = "0%";
    button.disabled = false;
    button.textContent = "Try loading again";
  } finally {
    if (context.runtime.operationAbort === controller) {
      context.runtime.operationAbort = null;
    }
    cancelButton.hidden = true;
  }
}

function downloadFirmware(context, sketch) {
  if (!sketch.trim()) {
    context.outlet.querySelector("[data-hardware-status]").textContent =
      "There isn’t code to download yet.";
    return;
  }
  const blob = new Blob([sketch], { type: "text/x-arduino;charset=utf-8" });
  const key = `${sketch.length}:${sketch.slice(0, 32)}`;
  const url = context.runtime.objectUrls.replace("firmware-download", key, blob);
  const link = context.root.createElement("a");
  link.href = url;
  link.download = "makeable-firmware.ino";
  link.click();
}

function diagnosticStatusRow(check) {
  const iconName =
    check.status === "pass"
      ? "check"
      : check.status === "fail"
        ? "x"
        : check.status === "running"
          ? "play"
          : "circle-alert";
  return `
    <li class="diagnostic-row diagnostic-row--${escapeAttribute(check.status)}" data-check-id="${escapeAttribute(
      check.id,
    )}">
      <span class="diagnostic-icon">${icon(iconName)}</span>
      <div>
        <strong>${escapeHtml(check.name)}</strong>
        <span>${escapeHtml(diagnosticStatusLabel(check))}</span>
        ${
          check.status === "fail"
            ? `<a href="/build/assemble" data-repair-step="${Math.max(
                0,
                Number(check.assemblyStep || 1) - 1,
              )}">Check connection ${Math.max(
                1,
                Number(check.assemblyStep || 1),
              )}</a>`
            : ""
        }
      </div>
    </li>
  `;
}

function diagnosticStatusLabel(check) {
  if (check.status === "pass") return check.detail || "OK";
  if (check.status === "fail") return check.detail || "Needs a wiring check";
  if (check.status === "running") return check.detail || "Testing…";
  if (check.status === "stopped") return "Stopped";
  return "Waiting";
}

function updateDiagnosticView(context, checks, message = "") {
  const list = context.outlet.querySelector("[data-diagnostic-statuses]");
  if (!list) return;
  list.innerHTML = checks.map(diagnosticStatusRow).join("");
  const passed = checks.filter(({ status }) => status === "pass").length;
  context.outlet.querySelector("[data-test-count]").textContent =
    `${passed} of ${checks.length}`;
  const progress = context.outlet.querySelector("[data-test-progress]");
  progress.max = Math.max(1, checks.length);
  progress.value = passed;
  if (message) {
    context.outlet.querySelector("[data-automatic-message]").textContent = message;
  }
  attachRepairLinks(context);
}

function attachRepairLinks(context) {
  for (const link of context.outlet.querySelectorAll("[data-repair-step]")) {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      const updated = selectAssemblyStep(
        context.app.getProject().wiring,
        Number(link.dataset.repairStep),
      );
      await persistWiringProgress(context.app, updated);
      context.app.navigation.navigate("/build/assemble");
    });
  }
}

async function startAutomaticTest(context, route, diagnostics) {
  const { outlet, app } = context;
  const startButton = outlet.querySelector("[data-start-test]");
  const stopButton = outlet.querySelector("[data-stop-test]");
  const message = outlet.querySelector("[data-automatic-message]");
  const controller = new AbortController();
  context.runtime.operationAbort = controller;
  startButton.disabled = true;
  stopButton.hidden = false;
  message.textContent = "Choose the flashed board so I can listen for real markers.";
  try {
    const session = await context.runtime.hardware.createDiagnosticSession({
      serial: context.window.navigator.serial,
      signal: controller.signal,
      onText(text) {
        message.textContent = `Board says: ${String(text).trim().slice(-120)}`;
      },
    });
    context.runtime.serialSession = session;
    const result = await runSequentialDiagnostics({
      diagnostics,
      session,
      signal: controller.signal,
      onStatus(checks) {
        updateDiagnosticView(context, checks);
      },
    });
    context.runtime.serialSession = null;
    const tests = app.getProject().tests || {};
    await app.updateProject("tests", {
      ...tests,
      automatic: {
        ...result,
        boardName: app.getProject().firmware?.flash?.boardName || "",
        completedAt: new Date().toISOString(),
      },
    });
    if (result.status === "pass") {
      updateDiagnosticView(
        context,
        result.checks,
        `Hardware check passed · ${result.checks.length} of ${result.checks.length}`,
      );
      outlet.querySelector("[data-your-turn]").disabled = false;
    } else if (result.status === "stopped") {
      updateDiagnosticView(context, result.checks, "Automatic check stopped safely.");
      startButton.disabled = false;
      startButton.textContent = "Retry automatic check";
    } else {
      updateDiagnosticView(
        context,
        result.checks,
        "One check needs attention. Open its connection link, repair it, then retry.",
      );
      startButton.disabled = false;
      startButton.textContent = "Retry automatic check";
    }
  } catch (error) {
    message.textContent =
      controller.signal.aborted || error?.name === "AbortError"
        ? "Automatic check stopped safely."
        : `I couldn’t start the automatic check: ${error.message}`;
    startButton.disabled = false;
    startButton.textContent = "Retry automatic check";
  } finally {
    if (context.runtime.operationAbort === controller) {
      context.runtime.operationAbort = null;
    }
    stopButton.hidden = true;
  }
}

function manualActionSteps(action) {
  const chunks = String(action)
    .split(/,\s*|\s+and\s+(?=(?:watch|look|confirm|check)\b)/i)
    .map((value) => value.trim().replace(/[.!]+$/, ""))
    .filter(Boolean)
    .slice(0, 3);
  return chunks.length ? chunks : ["Perform the requested real-world action"];
}

async function startManualCamera(context) {
  const status = context.outlet.querySelector("[data-evidence-status]");
  const video = context.outlet.querySelector("[data-camera-preview]");
  const capture = context.outlet.querySelector("[data-capture-evidence]");
  if (!context.window.navigator.mediaDevices?.getUserMedia) {
    status.textContent =
      "Camera access is unavailable in this browser. Use a browser with camera support.";
    return;
  }
  if (context.runtime.cameraRequest) {
    context.runtime.cameraRequest.cancelled = true;
  }
  const request = {
    cancelled: false,
    generation: context.runtime.routeGeneration,
  };
  context.runtime.cameraRequest = request;
  try {
    context.runtime.cameraStream?.getTracks?.().forEach((track) => track.stop());
    const stream = await context.window.navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    if (
      request.cancelled ||
      request.generation !== context.runtime.routeGeneration ||
      context.runtime.currentRoute?.path !== "/build/test/manual"
    ) {
      stream.getTracks?.().forEach((track) => track.stop());
      return;
    }
    if (context.runtime.cameraRequest === request) {
      context.runtime.cameraRequest = null;
    }
    context.runtime.cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    capture.disabled = false;
    status.textContent =
      "Camera ready. Keep the project in frame, perform the action, then capture evidence.";
  } catch (error) {
    if (request.cancelled) return;
    status.textContent = `I couldn’t open the camera: ${error.message}`;
  } finally {
    if (context.runtime.cameraRequest === request) {
      context.runtime.cameraRequest = null;
    }
  }
}

async function captureManualEvidence(context) {
  const status = context.outlet.querySelector("[data-evidence-status]");
  const video = context.outlet.querySelector("[data-camera-preview]");
  if (!context.runtime.cameraStream) {
    status.textContent = "Start the camera before capturing evidence.";
    return;
  }
  const canvas = context.root.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 360;
  const drawing = canvas.getContext("2d", { alpha: false });
  drawing.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Camera capture failed.")),
      "image/jpeg",
      0.82,
    ),
  );
  const evidence = {
    dataUrl,
    blob,
    takenAt: new Date().toISOString(),
  };
  evidence.savePromise = context.app.saveImage("manual-evidence", blob);
  context.runtime.evidence = evidence;
  await evidence.savePromise;
  status.textContent =
    "Evidence captured. I’ll combine this frame with the requested action and recent board output.";
}

async function acknowledgeManualTest(context, route, { action, acknowledged }) {
  const { outlet, app } = context;
  const guidance = outlet.querySelector("[data-repair-guidance]");
  const yesButton = outlet.querySelector("[data-manual-yes]");
  const notYetButton = outlet.querySelector("[data-manual-not-yet]");
  const evidence = context.runtime.evidence;
  if (!evidence) {
    guidance.textContent =
      "Capture one current camera frame first so the check uses real evidence.";
    return;
  }
  yesButton.disabled = true;
  notYetButton.disabled = true;
  guidance.textContent =
    "Comparing the requested action, camera evidence, and recent board output…";
  try {
    await evidence.savePromise;
    const project = app.getProject();
    const evaluator =
      context.runtime.hardware.evaluateManualTest || evaluateManualTest;
    const evaluation = await evaluator({
      projectTitle:
        project.feasibility?.projectTitle || ideaText(project.idea),
      requestedAction: action,
      imageDataUrl: evidence.dataUrl,
      serialOutput: project.tests?.automatic?.serialOutput || "",
      fetchImpl: context.window.fetch.bind(context.window),
    });
    const tests = app.getProject().tests || {};
    await app.updateProject("tests", {
      ...tests,
      manual: {
        acknowledged,
        requestedAction: action,
        evidenceImageId: "manual-evidence",
        capturedAt: evidence.takenAt,
        recentSerialOutput: String(
          project.tests?.automatic?.serialOutput || "",
        ).slice(-3000),
        evaluation,
      },
    });
    if (acknowledged) {
      await app.completeRoute(route.path);
      context.runtime.cameraStream?.getTracks?.().forEach((track) => track.stop());
      context.runtime.cameraStream = null;
      app.navigation.navigate("/build/publish/connect");
      return;
    }
    guidance.replaceChildren();
    const text = context.root.createElement("p");
    text.textContent = `Try this repair: ${evaluation.nextStep}`;
    const link = context.root.createElement("a");
    link.href = "/build/assemble";
    link.textContent = "Review the related connection";
    link.dataset.repairStep = "0";
    const retry = context.root.createElement("button");
    retry.type = "button";
    retry.className = "secondary-button";
    retry.textContent = "Retry manual test";
    retry.addEventListener("click", () => {
      guidance.textContent =
        "Perform the action again, then capture a fresh camera frame.";
      context.runtime.evidence = null;
    });
    guidance.append(text, link, retry);
    attachRepairLinks(context);
  } catch (error) {
    guidance.textContent = `I couldn’t finish the evidence check: ${error.message}. Retry with the project in view.`;
  } finally {
    yesButton.disabled = false;
    notYetButton.disabled = false;
  }
}

async function persistReviewSelection(context, selectedPartId) {
  await context.app.updateProject("review", { selectedPartId: selectedPartId || null });
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

async function hydrateStoredImage(context, imageId, image, annotationLayer = null) {
  if (!image) return;
  try {
    const cacheKey = photoCacheKey(context.app.getProject(), imageId);
    let photoUrl = context.runtime.objectUrls.get("photo", cacheKey);
    if (!photoUrl) {
      const blob = await context.app.loadImage(imageId);
      if (!blob) return;
      if (cacheKey !== photoCacheKey(context.app.getProject(), imageId)) return;
      photoUrl = context.runtime.objectUrls.replace("photo", cacheKey, blob);
    }
    image.src = photoUrl;
    if (annotationLayer) {
      const align = () => alignAnnotationLayer(context, image, annotationLayer);
      if (image.complete && image.naturalWidth) align();
      else image.addEventListener("load", align, { once: true });
      context.runtime.imageObservers.get("photo")?.disconnect();
      if (typeof context.window.ResizeObserver === "function") {
        const observer = new context.window.ResizeObserver(align);
        observer.observe(image);
        context.runtime.imageObservers.set("photo", observer);
      }
    }
  } catch {
    image.removeAttribute("src");
  }
}

function photoCacheKey(project, imageId) {
  const photo = project.photo || {};
  return [
    imageId,
    photo.revision || "",
    photo.width || "",
    photo.height || "",
    photo.originalName || "",
  ].join(":");
}

function alignAnnotationLayer(context, image, annotationLayer) {
  const photo = context.app.getProject().photo || {};
  const frame = calculateContainedImageFrame(
    { width: image.clientWidth, height: image.clientHeight },
    {
      width: image.naturalWidth || photo.width,
      height: image.naturalHeight || photo.height,
    },
  );
  annotationLayer.style.left = `${image.offsetLeft + frame.left}px`;
  annotationLayer.style.top = `${image.offsetTop + frame.top}px`;
  annotationLayer.style.width = `${frame.width}px`;
  annotationLayer.style.height = `${frame.height}px`;
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

function repositoryNameFromTitle(value) {
  return String(value || "makeable-project")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/\.{2,}/g, ".")
    .slice(0, 100) || "makeable-project";
}

function artifactDisplayName(path) {
  if (path === "build-guide/README.md") return "build-guide";
  if (path === "code/makeable.ino") return "code";
  if (path === "parts-list/README.md") return "parts-list";
  if (path === "test-results/README.md") return "test-results";
  return path;
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
