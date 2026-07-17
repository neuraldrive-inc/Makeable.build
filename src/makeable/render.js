import { APP_READY_MESSAGE, PRODUCT_NAME } from "./content.js";

export function initializeShell(root = document) {
  const heading = root.querySelector("[data-app-heading]");
  const status = root.querySelector("#appStatus");

  if (heading) heading.textContent = PRODUCT_NAME;
  if (status) status.textContent = APP_READY_MESSAGE;
  root.documentElement.dataset.makeableReady = "true";
}
