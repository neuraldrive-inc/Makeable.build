import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "images"), { recursive: true });

for (const file of ["index.html", "app.js", "styles.css"]) {
  await cp(path.join(root, file), path.join(output, file));
}

await cp(path.join(root, "lib"), path.join(output, "lib"), { recursive: true });
await cp(path.join(root, "images", "makeable"), path.join(output, "images", "makeable"), {
  recursive: true,
});
