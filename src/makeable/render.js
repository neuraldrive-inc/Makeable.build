import { APP_READY_MESSAGE, PRODUCT_NAME } from "./content.js";
import { currentProjectKey, resetGeneration } from "./api-client.js";
import { createRouter } from "./router.js";
import { createScreenRenderer } from "./screens.js";
import {
  createIndexedDbAdapter,
  createProjectController,
  createProjectSnapshot,
  createProjectStore,
  createSettingsStore,
} from "./state.js";

export async function initializeShell(root = document, options = {}) {
  const heading = root.querySelector("[data-app-heading]");
  const status = root.querySelector("#appStatus");
  const skipLink = root.querySelector(".skip-link");
  const main = root.querySelector("#main-content");

  if (heading) heading.textContent = PRODUCT_NAME;
  if (status) status.textContent = APP_READY_MESSAGE;
  if (skipLink && main) {
    skipLink.addEventListener("click", (event) => {
      event.preventDefault();
      main.focus();
    });
  }
  root.documentElement.dataset.makeableReady = "true";

  const windowLike = root.defaultView;
  if (!windowLike) return null;
  createSettingsStore({ storage: windowLike.localStorage }).load();
  const projectStore =
    options.projectStore ||
    createProjectStore({
      adapter: createIndexedDbAdapter({ indexedDB: windowLike.indexedDB }),
    });
  const project = createProjectController({ store: projectStore });
  const projectId = currentProjectKey();
  await project.load(projectId);
  let screenRenderer = null;
  let hasRenderedRoute = false;
  const navigation = createRouter({
    window: windowLike,
    getProject: () => project.current,
    onRoute: (route) => {
      updateProgressRail(root, route.rail, project.current);
      screenRenderer?.render(route);
      announceRoute(root, windowLike, { focus: hasRenderedRoute });
      hasRenderedRoute = true;
    },
  });
  root.querySelector(".progress-rail")?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-progress-action]");
    if (!action || action.getAttribute("aria-disabled") === "true" || !action.dataset.route) {
      event.preventDefault();
      return;
    }
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigation.navigate(action.dataset.route);
  });
  const app = Object.freeze({
    navigation,
    getProject: () => project.current,
    replaceProject: (snapshot) => project.replace(snapshot),
    updateProject: (field, value, updateOptions) =>
      project.update(field, value, updateOptions),
    completeRoute: (path, updateOptions) => project.completeRoute(path, updateOptions),
    saveImage: (imageId, blob) => project.saveImage(imageId, blob),
    loadImage: (imageId) => project.loadImage(imageId),
    deleteImage: (imageId) => project.deleteImage(imageId),
    async resetProject() {
      for (const imageId of ["source", "sketch", "manual-evidence"]) {
        await project.deleteImage(imageId);
      }
      resetGeneration();
      return project.replace(createProjectSnapshot({ id: project.current.id }));
    },
  });
  screenRenderer = createScreenRenderer({ root, app });
  navigation.start();
  windowLike.MAKEABLE_APP = app;
  return app;
}

function updateProgressRail(root, activeRail, project = {}) {
  const completedRoutes = new Set(project.progress?.completedRoutes || []);
  const completedRails = new Set();
  if (completedRoutes.has("/build/new")) completedRails.add("describe");
  if (completedRoutes.has("/build/parts/review")) completedRails.add("scan");
  if (completedRoutes.has("/build/code")) completedRails.add("build");
  if (completedRoutes.has("/build/test/manual")) completedRails.add("test");
  if (completedRoutes.has("/build/publish/connect")) completedRails.add("publish");
  for (const step of root.querySelectorAll("[data-progress-step]")) {
    if (step.dataset.progressStep === activeRail) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
    const complete = completedRails.has(step.dataset.progressStep);
    const action = step.querySelector("[data-progress-action]");
    const target = latestRailRoute(step.dataset.progressStep, completedRoutes);
    step.classList.toggle("is-complete", complete);
    if (action) {
      action.dataset.route = target || "";
      if (complete && target) {
        action.href = target;
        action.removeAttribute("aria-disabled");
        action.removeAttribute("tabindex");
      } else {
        action.removeAttribute("href");
        action.setAttribute("aria-disabled", "true");
        action.setAttribute("tabindex", "-1");
      }
      action.setAttribute(
        "aria-label",
        complete
          ? `${action.querySelector(".progress-label")?.textContent || "Build step"} — revisit`
          : action.querySelector(".progress-label")?.textContent || "Build step",
      );
    }
  }
}

function announceRoute(root, windowLike, { focus = true } = {}) {
  const routeHeading = root.querySelector(".route-screen h1");
  if (!routeHeading) return;
  routeHeading.setAttribute("tabindex", "-1");
  if (focus) routeHeading.focus({ preventScroll: true });
  const title = routeHeading.textContent?.trim() || PRODUCT_NAME;
  root.title = `${title} · ${PRODUCT_NAME}`;
  const status = root.querySelector("#appStatus");
  if (status) status.textContent = `${title} screen loaded.`;
  if (focus) {
    windowLike.requestAnimationFrame?.(() => {
      if (windowLike.matchMedia?.("(max-width: 900px)").matches) {
        routeHeading.scrollIntoView({ block: "start" });
        return;
      }
      windowLike.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
    });
  }
}

function latestRailRoute(rail, completedRoutes) {
  const candidates = {
    describe: ["/build/new"],
    scan: [
      "/build/feasibility/ready",
      "/build/parts/review",
      "/build/parts/upload",
    ],
    build: ["/build/code", "/build/assemble"],
    test: ["/build/test/manual", "/build/test/automatic"],
    publish: ["/build/publish/success", "/build/publish/connect"],
  };
  return (candidates[rail] || []).find((path) => completedRoutes.has(path)) || "";
}
