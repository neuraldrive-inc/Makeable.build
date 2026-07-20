import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landingSource = readFileSync(
  new URL("../../index.html", import.meta.url),
  "utf8",
);
const landingStyles = readFileSync(
  new URL("../../styles/landing-v2.css", import.meta.url),
  "utf8",
);
const landingScript = readFileSync(
  new URL("../../landing.js", import.meta.url),
  "utf8",
);
const runtimeSources = [landingSource, landingStyles, landingScript];

const imageSources = [...landingSource.matchAll(/<img\b[\s\S]*?\bsrc="([^"]+)"/g)]
  .map((match) => match[1])
  .sort();

const approvedImageSources = [
  "/assets/icons/google-g.svg",
  "/assets/icons/lucide/arrow-left.svg",
  "/assets/icons/lucide/arrow-right.svg",
  "/assets/landing/connect-hardware-clean.png",
  "/assets/landing/desk-parts.jpeg",
  "/assets/landing/recognize-hardware-clean-v2.png",
  "/assets/landing/test-hardware-clean-v2.png",
].sort();

const rasterSources = [
  ...new Set(
    runtimeSources.flatMap((source) =>
      [...source.matchAll(/\/assets\/[^\s"'()]+\.(?:png|jpe?g|webp)/g)].map(
        (match) => match[0],
      ),
    ),
  ),
].sort();

const approvedRasterSources = [
  "/assets/landing/connect-hardware-clean.png",
  "/assets/landing/desk-parts.jpeg",
  "/assets/landing/desk-wood-fill.jpeg",
  "/assets/landing/paper-cream.jpeg",
  "/assets/landing/recognize-hardware-clean-v2.png",
  "/assets/landing/test-hardware-clean-v2.png",
].sort();

test("landing raster and icon sources stay on the manually audited allowlist", () => {
  assert.deepEqual(imageSources, approvedImageSources);
  assert.deepEqual(rasterSources, approvedRasterSources);
  const runtimeSource = runtimeSources.join("\n");
  assert.equal(runtimeSource.includes("codex-clipboard"), false);
  assert.equal(runtimeSource.includes("Screenshot 2026"), false);
  assert.equal(runtimeSource.includes("product-design-qa"), false);
});
