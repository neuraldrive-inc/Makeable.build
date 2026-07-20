import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "pilot"), path.join(output, "pilot"), { recursive: true });
await cp(path.join(root, "pilot", "index.html"), path.join(output, "pilot-app.html"));
await rm(path.join(output, "pilot", "index.html"));
