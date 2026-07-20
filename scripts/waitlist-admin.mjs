#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getStore } from "@netlify/blobs";
import { waitlistSignupKey } from "../lib/waitlist-storage.mjs";
import { waitlistSessionStoreName } from "../lib/waitlist-session.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const execFileAsync = promisify(execFile);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Waitlist operation failed.");
    process.exitCode = 1;
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    printUsage();
    return;
  }

  const preview = args.includes("--preview");
  const storeName = preview ? "waitlist-preview" : "waitlist";
  const store = adminStore(storeName);

  if (command === "export") {
    await exportWaitlist(store, args);
    return;
  }
  if (command === "delete") {
    await deleteSignup(store, adminStore(waitlistSessionStoreName(
      preview ? "deploy-preview" : "production",
    )), args);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

export async function readVerifiedWaitlist(store) {
  const recordsByEmail = new Map();
  for await (const page of store.list({ prefix: "signup-", paginate: true })) {
    for (const blob of page.blobs) {
      const record = await store.get(blob.key, { type: "json" });
      const normalized = normalizeStoredRecord(record);
      if (!normalized) continue;
      const existing = recordsByEmail.get(normalized.email);
      if (!existing || normalized.createdAt < existing.createdAt) {
        recordsByEmail.set(normalized.email, normalized);
      }
    }
  }
  return [...recordsByEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export function waitlistCsv(records) {
  const rows = ["email,name,source,created_at"];
  for (const record of records) {
    rows.push(
      [record.email, record.name, record.source, record.createdAt]
        .map(csvCell)
        .join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

async function exportWaitlist(store, args) {
  const outputValue = optionValue(args, "--output");
  if (!outputValue) {
    throw new Error("Export requires --output with a path outside this repository.");
  }
  const outputPath = path.resolve(outputValue);
  assertOutsideRepository(outputPath);
  const format = String(optionValue(args, "--format") || "csv").toLowerCase();
  if (!new Set(["csv", "json"]).has(format)) {
    throw new Error("--format must be csv or json.");
  }

  const records = await readVerifiedWaitlist(store);
  const output =
    format === "json"
      ? `${JSON.stringify(records, null, 2)}\n`
      : waitlistCsv(records);
  await writeFile(outputPath, output, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log(`Exported ${records.length} verified waitlist record(s) to a private file.`);
}

async function deleteSignup(store, sessionStore, args) {
  const email = normalizeEmail(optionValue(args, "--email"));
  if (!email) throw new Error("Delete requires a valid --email value.");
  if (!args.includes("--confirm")) {
    throw new Error("Delete is permanent. Repeat the command with --confirm.");
  }
  const signupKey = waitlistSignupKey(email);
  await store.delete(signupKey);
  let removedSessions = 0;
  for await (const page of sessionStore.list({ prefix: "session-", paginate: true })) {
    for (const blob of page.blobs) {
      const session = await sessionStore.get(blob.key, { type: "json" });
      if (session?.signupKey !== signupKey) continue;
      await sessionStore.delete(blob.key);
      removedSessions += 1;
    }
  }
  console.log(
    `Deleted the matching waitlist record and ${removedSessions} browser confirmation(s), if present.`,
  );
}

function normalizeStoredRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const email = normalizeEmail(value.email);
  if (!email || value.source !== "google") return null;
  const createdAt = validTimestamp(value.createdAt || value.firstSeenAt);
  if (!createdAt) return null;
  return {
    email,
    name: typeof value.name === "string" ? value.name.trim().slice(0, 120) : "",
    source: "google",
    createdAt,
  };
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "";
  }
  return email;
}

function validTimestamp(value) {
  if (typeof value !== "string" || !value) return "";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : timestamp.toISOString();
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function assertOutsideRepository(outputPath) {
  const relative = path.relative(repositoryRoot, outputPath);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("For privacy, waitlist exports must be written outside the repository.");
  }
}

function adminStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID || "";
  const token = process.env.NETLIFY_AUTH_TOKEN || "";
  if (Boolean(siteID) !== Boolean(token)) {
    throw new Error(
      "Set both NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN, or neither to use the authenticated Netlify CLI.",
    );
  }
  if (siteID && token) {
    return getStore({ name, siteID, token, consistency: "strong" });
  }
  return netlifyCliStore(name);
}

function netlifyCliStore(name) {
  return {
    async *list(options = {}) {
      const args = ["netlify", "blobs:list", name, "--json"];
      if (options.prefix) args.push("--prefix", options.prefix);
      const { stdout } = await runNpx(args);
      const parsed = parseCliJson(stdout, "list");
      yield {
        blobs: Array.isArray(parsed.blobs) ? parsed.blobs : [],
        directories: Array.isArray(parsed.directories) ? parsed.directories : [],
      };
    },
    async get(key, options = {}) {
      const { stdout } = await runNpx(["netlify", "blobs:get", name, key]);
      return options.type === "json" ? parseCliJson(stdout, "record") : stdout;
    },
    async delete(key) {
      await runNpx(["netlify", "blobs:delete", name, key, "--force"]);
    },
  };
}

async function runNpx(args) {
  return execFileAsync("npx", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseCliJson(value, label) {
  const start = value.indexOf("{");
  if (start < 0) throw new Error(`Netlify CLI returned an invalid ${label}.`);
  try {
    return JSON.parse(value.slice(start));
  } catch {
    throw new Error(`Netlify CLI returned an invalid ${label}.`);
  }
}

function printUsage() {
  console.log(`Usage:
  npm run waitlist:admin -- export --output /private/path/waitlist.csv [--format csv|json]
  npm run waitlist:admin -- delete --email person@example.com --confirm

Authentication: either sign in with Netlify CLI, or set both NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN.
Add --preview to operate on the isolated deploy-preview store.`);
}
