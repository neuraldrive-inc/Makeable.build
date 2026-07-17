import { APP_READY_MESSAGE, PRODUCT_NAME } from "./content.js";
import { createRouter } from "./router.js";
import { createProjectSnapshot, createSettingsStore } from "./state.js";

export function initializeShell(root = document) {
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
  const project = createProjectSnapshot();
  const navigation = createRouter({
    window: windowLike,
    getProject: () => project,
    onRoute: (route) => updateProgressRail(root, route.rail),
  });
  navigation.start();
  return navigation;
}

function updateProgressRail(root, activeRail) {
  for (const step of root.querySelectorAll("[data-progress-step]")) {
    if (step.dataset.progressStep === activeRail) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  }
}
