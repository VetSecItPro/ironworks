#!/usr/bin/env node
/**
 * OpenRouter model-registry drift watcher.
 *
 * Hits https://openrouter.ai/api/v1/models, diffs the IDs against the
 * hardcoded OPENROUTER_MODELS registry shipped in
 * packages/adapters/openrouter-api/src/shared/models.ts, and prints a
 * report of:
 *   - Models present upstream but missing from our registry (candidates to add)
 *   - Models in our registry that have disappeared upstream (deprecated)
 *   - Free-tier (`:free` suffix) additions, called out separately because
 *     those are the ones we use in the Atlas Ops fleet
 *
 * Designed to run as a weekly cron on the VPS. Exit codes:
 *   0 — no drift
 *   1 — drift detected (cron should send a Telegram alert)
 *   2 — fetch / parse failed
 *
 * Run:  node scripts/openrouter-model-watcher.mjs
 * Cron: 0 14 * * MON  (Mondays 14:00 UTC = 09:00 CDT)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_FILE = path.join(__dirname, "..", "packages", "adapters", "openrouter-api", "src", "shared", "models.ts");

function parseRegistryIds() {
  const src = readFileSync(MODELS_FILE, "utf8");
  // Match `id: "..."` lines inside OPENROUTER_MODELS — the source-of-truth list.
  const matches = [...src.matchAll(/id:\s*"([^"]+)",/g)];
  return new Set(matches.map((m) => m[1]));
}

async function fetchUpstream() {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json.data)) throw new Error("unexpected response shape");
  return new Set(json.data.map((m) => m.id));
}

function setDiff(a, b) {
  return [...a].filter((x) => !b.has(x));
}

(async () => {
  let registry;
  let upstream;
  try {
    registry = parseRegistryIds();
    upstream = await fetchUpstream();
  } catch (err) {
    console.error(`[model-watcher] fetch/parse failed: ${err.message}`);
    process.exit(2);
  }

  const added = setDiff(upstream, registry); // upstream has, we don't
  const removed = setDiff(registry, upstream); // we have, upstream lost
  const addedFree = added.filter((id) => id.endsWith(":free"));

  console.log(`[model-watcher] registry: ${registry.size} models | upstream: ${upstream.size} models`);
  console.log(`[model-watcher] additions: ${added.length} (free-tier: ${addedFree.length})`);
  console.log(`[model-watcher] removals:  ${removed.length}`);

  if (addedFree.length > 0) {
    console.log("\nNew free-tier models (consider adding to OPENROUTER_MODELS):");
    addedFree.sort().forEach((id) => {
      console.log(`  + ${id}`);
    });
  }
  if (added.length - addedFree.length > 0) {
    console.log("\nOther additions (paid):");
    added
      .filter((id) => !id.endsWith(":free"))
      .sort()
      .forEach((id) => {
        console.log(`  + ${id}`);
      });
  }
  if (removed.length > 0) {
    console.log("\nDeprecated upstream (remove from OPENROUTER_MODELS):");
    removed.sort().forEach((id) => {
      console.log(`  - ${id}`);
    });
  }

  if (added.length === 0 && removed.length === 0) {
    console.log("\nNo drift.");
    process.exit(0);
  }

  process.exit(1);
})();
