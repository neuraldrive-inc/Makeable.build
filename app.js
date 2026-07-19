import { initializeApiClient } from "./src/makeable/api-client.js";
import { initializeShell } from "./src/makeable/render.js";

await initializeApiClient();
await initializeShell();
