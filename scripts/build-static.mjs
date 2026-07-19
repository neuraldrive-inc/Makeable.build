import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
for (const file of ["index.html", "app.js", "styles.css"]) {
  await cp(path.join(root, file), path.join(output, file));
}

for (const directory of [
  "assets",
  "lib",
  "styles",
  path.join("src", "makeable"),
  path.join("images", "makeable"),
]) {
  const destination = path.join(output, directory);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, directory), destination, { recursive: true });
}
