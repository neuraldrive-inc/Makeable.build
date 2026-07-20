import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the public landing bundle contains every referenced local asset", async () => {
  await import(`../scripts/build-static.mjs?landing-test=${Date.now()}`);
  const landingHtml = await readFile(path.join(root, "dist", "index.html"), "utf8");
  const landingCss = await readFile(
    path.join(root, "dist", "styles", "landing-v2.css"),
    "utf8",
  );

  const htmlReferences = [...landingHtml.matchAll(/(?:src|href)="(\/(?:assets|styles)\/[^"?#]+)[^\"]*"/g)]
    .map((match) => match[1]);
  const cssReferences = [...landingCss.matchAll(/url\("\.\.\/(assets\/[^"?#]+)[^\"]*"\)/g)]
    .map((match) => `/${match[1]}`);
  const dynamicReferences = ["/assets/icons/lucide/check.svg"];
  const references = [...new Set([...htmlReferences, ...cssReferences, ...dynamicReferences])];

  assert.ok(references.length >= 10);
  for (const reference of references) {
    await access(path.join(root, "dist", reference));
  }
});

test("the landing bundle does not expose the pilot or builder source entrypoints", async () => {
  const landingScript = await readFile(path.join(root, "landing.js"), "utf8");
  assert.doesNotMatch(landingScript, /makeable\.pilot|\/build\/new|intent:\s*["']pilot/);
  await assert.rejects(access(path.join(root, "dist", "app.js")));
  await assert.rejects(access(path.join(root, "dist", "styles.css")));
});
