import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const fromRoot = (...segments) => path.join(root, ...segments);
async function read(...segments) {
  try {
    return await readFile(fromRoot(...segments), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      assert.fail(`${segments.join("/")} should exist`);
    }
    throw error;
  }
}

async function assertNonEmptyFile(...segments) {
  const file = fromRoot(...segments);
  try {
    await access(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      assert.fail(`${segments.join("/")} should exist`);
    }
    throw error;
  }
  const details = await stat(file);
  assert.ok(details.size > 0, `${segments.join("/")} should not be empty`);
}

test("the document exposes the semantic Makeable application shell", async () => {
  const html = await read("index.html");

  assert.match(html, /<title>Makeable<\/title>/);
  assert.doesNotMatch(html, /GeckCo AI|Codex For Hardware/);
  assert.match(html, /<a[^>]+class="skip-link"[^>]+href="#main-content"/);
  assert.match(html, /<header[^>]+data-makeable-shell/);
  assert.match(html, /<nav[^>]+aria-label="Build progress"/);
  assert.match(html, /<main[^>]+id="main-content"[^>]+tabindex="-1"/);
  assert.match(html, /<section[^>]+data-screen-outlet/);
  assert.match(html, /<p[^>]+id="appStatus"[^>]+role="status"[^>]+aria-live="polite"/);
});

test("the build progress shell contains the five approved parent steps", async () => {
  const html = await read("index.html");

  for (const label of ["Describe", "Scan Parts", "Build + Code", "Test", "Publish"]) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(html, new RegExp(`>${escapedLabel}<`));
  }
  assert.equal((html.match(/data-progress-step=/g) || []).length, 5);
  assert.match(html, /data-progress-step="describe"[^>]+aria-current="step"/);
});

test("the root bootstrap delegates Makeable concerns to focused modules", async () => {
  const app = await read("app.js");

  assert.match(app, /src\/makeable\/render\.js/);
  for (const moduleName of ["actions", "content", "render", "router", "state"]) {
    await assertNonEmptyFile("src", "makeable", `${moduleName}.js`);
  }
});

test("the supplied tokens, self-hosted fonts, and licensed icon subset are runtime assets", async () => {
  const sourceTokens = await read("Makeable figma", "tokens", "makeable.css");
  const runtimeTokens = await read("styles", "makeable.tokens.css");
  const makeableStyles = await read("styles", "makeable.css");

  assert.equal(runtimeTokens.trim(), sourceTokens.trim());
  for (const family of ["Fredoka", "Nunito Sans", "Shantell Sans", "Roboto Mono"]) {
    assert.match(makeableStyles, new RegExp(`font-family:\\s*"${family}"`));
  }

  for (const font of ["fredoka", "nunito-sans", "shantell-sans", "roboto-mono"]) {
    await assertNonEmptyFile("assets", "fonts", font, `${font}.woff2`);
    await assertNonEmptyFile("assets", "fonts", font, "OFL.txt");
  }

  for (const icon of ["camera", "check", "code-xml", "github", "mic", "paperclip", "upload"]) {
    await assertNonEmptyFile("assets", "icons", "lucide", `${icon}.svg`);
  }
  await assertNonEmptyFile("assets", "icons", "lucide", "LICENSE");
});

test("the package and local server identify the product as Makeable", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const server = await read("server.mjs");

  assert.equal(packageJson.name, "makeable");
  assert.match(server, /Makeable running at/);
  assert.doesNotMatch(server, /GeckCo AI running at/);
});
