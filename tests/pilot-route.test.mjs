import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the production landing and pilot stay packaged as self-contained experiences", async () => {
  await import(`../scripts/build-static.mjs?pilot-test=${Date.now()}`);

  const pilotHtml = await readFile(path.join(root, "dist", "pilot-app.html"), "utf8");
  assert.match(pilotHtml, /<base href="\/pilot\/" \/>/);
  assert.match(pilotHtml, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(pilotHtml, /<script src="\/config\.local\.js"><\/script>/);
  assert.doesNotMatch(pilotHtml, /src="\.\/config\.local\.js"/);

  for (const relativePath of [
    "pilot/app.js",
    "pilot/styles.css",
    "pilot/lib/board-profiles.mjs",
    "pilot/images/makeable/icon-chat.svg",
  ]) {
    await access(path.join(root, "dist", relativePath));
  }

  const landingHtml = await readFile(path.join(root, "dist", "index.html"), "utf8");
  assert.match(landingHtml, /Build the/);
  assert.match(landingHtml, /thing in/);
  assert.match(landingHtml, /your head\./);
  assert.match(landingHtml, /Makeable is an AI hardware prototyping studio/);
  assert.match(landingHtml, /<link rel="canonical" href="https:\/\/makeable\.build\/" \/>/);
  assert.match(landingHtml, /<script type="module" src="\/landing\.js"><\/script>/);
  for (const relativePath of [
    "landing.js",
    "styles/landing-v2.css",
    "styles/legal.css",
    "assets/fonts/fredoka/fredoka.woff2",
    "assets/icons/google-g.svg",
    "assets/landing/desk-parts-v2.png",
    "robots.txt",
    "sitemap.xml",
    "privacy/index.html",
    "terms/index.html",
  ]) {
    await access(path.join(root, "dist", relativePath));
  }

  const privacyHtml = await readFile(path.join(root, "dist", "privacy", "index.html"), "utf8");
  const termsHtml = await readFile(path.join(root, "dist", "terms", "index.html"), "utf8");
  assert.match(privacyHtml, /Google sign-in supplies your name, email address, and email verification/);
  assert.match(privacyHtml, /stable account identifier/);
  assert.match(privacyHtml, /does not store either in new waitlist records/);
  assert.match(privacyHtml, /random, HttpOnly browser/);
  assert.match(privacyHtml, /not a Google credential/);
  assert.match(privacyHtml, /Netlify Blobs/);
  assert.match(privacyHtml, /mohammedkhambhati2020@gmail\.com/);
  assert.match(termsHtml, /Early access, not a finished product/);
  assert.match(termsHtml, /acceptable-use rules/);
  assert.match(landingHtml, /href="\/privacy\/"/);
  assert.match(landingHtml, /href="\/terms\/"/);

  await assert.rejects(access(path.join(root, "dist", "app.js")));
  await assert.rejects(access(path.join(root, "dist", "styles.css")));
});

test("Netlify serves the landing at root and rewrites only the pilot entrypoint", async () => {
  const config = await readFile(path.join(root, "netlify.toml"), "utf8");
  assert.match(
    config,
    /from = "\/pilot"[\s\S]*?to = "\/pilot-app\.html"[\s\S]*?status = 200[\s\S]*?force = true/,
  );
  assert.doesNotMatch(config, /from = "\/"/);
});
