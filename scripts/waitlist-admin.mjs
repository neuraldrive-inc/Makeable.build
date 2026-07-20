#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "@netlify/blobs";
import { waitlistSignupKey } from "../lib/waitlist-storage.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

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

  const siteID = requireEnvironment("NETLIFY_SITE_ID");
  const token = requireEnvironment("NETLIFY_AUTH_TOKEN");
  const store = getStore({
    name: args.includes("--preview") ? "waitlist-preview" : "waitlist",
    siteID,
    token,
    consistency: "strong",
  });

  if (command === "export") {
    await exportWaitlist(store, args);
    return;
  }
  if (command === "delete") {
    await deleteSignup(store, args);
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

async function deleteSignup(store, args) {
  const email = normalizeEmail(optionValue(args, "--email"));
  if (!email) throw new Error("Delete requires a valid --email value.");
  if (!args.includes("--confirm")) {
    throw new Error("Delete is permanent. Repeat the command with --confirm.");
  }
  await store.delete(waitlistSignupKey(email));
  console.log("Deleted the matching waitlist record, if it existed.");
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

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function printUsage() {
  console.log(`Usage:
  npm run waitlist:admin -- export --output /private/path/waitlist.csv [--format csv|json]
  npm run waitlist:admin -- delete --email person@example.com --confirm

Required environment: NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN.
Add --preview to operate on the isolated deploy-preview store.`);
}
