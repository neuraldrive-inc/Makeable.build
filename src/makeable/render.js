import { APP_READY_MESSAGE, PRODUCT_NAME } from "./content.js";
import { createRouter } from "./router.js";
import {
  createIndexedDbAdapter,
  createProjectController,
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
  await project.load();
  const navigation = createRouter({
    window: windowLike,
    getProject: () => project.current,
    onRoute: (route) => updateProgressRail(root, route.rail),
  });
  navigation.start();
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
  });
  windowLike.MAKEABLE_APP = app;
  return app;
}

function updateProgressRail(root, activeRail) {
  for (const step of root.querySelectorAll("[data-progress-step]")) {
    if (step.dataset.progressStep === activeRail) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  }
}
