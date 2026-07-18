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
  const html = await read("builder.html");

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
  const html = await read("builder.html");

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

test("the local server discovers user-installed Arduino CLI binaries", async () => {
  const server = await read("server.mjs");

  assert.match(server, /homedir/);
  assert.match(
    server,
    /path\.join\(homedir\(\),\s*["']\.local["'],\s*["']bin["'],\s*["']arduino-cli["']\)/,
  );
});

test("the browser regression matrix uses a bounded worker pool", async () => {
  const config = (await import("../../playwright.config.js")).default;

  assert.equal(config.workers, 2);
});

test("the favicon and brand accent use the licensed vendored icon", async () => {
  const html = await read("builder.html");
  const makeableStyles = await read("styles", "makeable.css");

  assert.doesNotMatch(html, /data:image\/svg\+xml/);
  assert.match(html, /rel="icon" href="\.\/assets\/icons\/lucide\/sparkles\.svg"/);
  assert.match(
    html,
    /<img[^>]+class="brand-spark"[^>]+src="\.\/assets\/icons\/lucide\/sparkles\.svg"[^>]+alt=""/,
  );
  assert.doesNotMatch(makeableStyles, /\.brand-spark::(?:before|after)/);
  await assertNonEmptyFile("assets", "icons", "lucide", "sparkles.svg");
  await assertNonEmptyFile("assets", "icons", "lucide", "LICENSE");
});

test("the vendored asset inventory records the complete icon subset", async () => {
  const assetReadme = await read("assets", "README.md");

  assert.match(assetReadme, /16-icon Lucide SVG subset/);
  assert.match(assetReadme, /lucide-static@0\.468\.0/);
});

test("generated local firmware work is ignored", async () => {
  const gitignore = await read(".gitignore");

  assert.match(gitignore, /^\.geckco-ai\/$/m);
});

test("the handoff README does not claim omitted source directories are present", async () => {
  const handoffReadme = await read("Makeable figma", "README.md");

  assert.doesNotMatch(handoffReadme, /outputs remain in `ui-concepts\//);
  assert.doesNotMatch(handoffReadme, /## GitHub references downloaded/);
  assert.doesNotMatch(handoffReadme, /`references\/github\//);
  assert.match(handoffReadme, /not included in this repository copy/i);
});
