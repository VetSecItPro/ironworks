/**
 * Integration test harness — fires one real API call per HTTP adapter to prove
 * live connectivity. Gated behind env keys; skips adapters whose keys are absent.
 *
 * Run: pnpm test:integration
 * Cost: ~$0.001-0.01 per full run (one cheap call per adapter).
 *
 * NOT run in CI — requires live API keys. Manual gate only.
 */

import { anthropicApiAdapter } from "@ironworksai/adapter-anthropic-api/server";
import { openaiApiAdapter } from "@ironworksai/adapter-openai-api/server";
import { openrouterApiAdapter } from "@ironworksai/adapter-openrouter-api/server";
import { poeApiAdapter } from "@ironworksai/adapter-poe-api/server";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@ironworksai/adapter-utils";

// ---------------------------------------------------------------------------
// Minimal context factory — builds a valid AdapterExecutionContext for a
// single liveness-probe prompt. Max 100 tokens to keep cost near zero.
// ---------------------------------------------------------------------------

function makeContext(adapterType: string, config: Record<string, unknown>, prompt: string): AdapterExecutionContext {
  const logs: string[] = [];
  return {
    runId: `integration-test-${adapterType}-${Date.now()}`,
    agent: {
      id: `test-agent-${adapterType}`,
      companyId: "test-company",
      name: `Integration Test — ${adapterType}`,
      adapterType,
      adapterConfig: config,
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config,
    // wakeReason carries the user message in all HTTP adapters (see execute.ts)
    context: {
      wakeReason: prompt,
    },
    onLog: async (_stream, chunk) => {
      logs.push(chunk);
    },
    onMeta: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Adapter probe descriptors
// ---------------------------------------------------------------------------

interface ProbeDescriptor {
  name: string;
  envKey: string;
  configKey: string;
  model: string;
  run: (ctx: AdapterExecutionContext) => Promise<AdapterExecutionResult>;
}

const PROBES: ProbeDescriptor[] = [
  {
    name: "poe_api",
    envKey: "POE_API_KEY",
    configKey: "apiKey",
    // Cheapest Poe model that supports streaming + replies deterministically
    model: "claude-haiku-4-5",
    run: (ctx) => poeApiAdapter.execute(ctx),
  },
  {
    name: "anthropic_api",
    envKey: "ANTHROPIC_API_KEY",
    configKey: "apiKey",
    // claude-haiku-4-5 is Anthropic's cheapest streaming model
    model: "claude-haiku-4-5",
    run: (ctx) => anthropicApiAdapter.execute(ctx),
  },
  {
    name: "openai_api",
    envKey: "OPENAI_API_KEY",
    configKey: "apiKey",
    // gpt-5-mini — cheapest OpenAI model in the adapter catalog
    model: "gpt-5-mini",
    run: (ctx) => openaiApiAdapter.execute(ctx),
  },
  {
    name: "openrouter_api",
    envKey: "OPENROUTER_API_KEY",
    configKey: "apiKey",
    // google/gemini-2.5-flash — cheap + fast on OpenRouter
    model: "google/gemini-2.5-flash",
    run: (ctx) => openrouterApiAdapter.execute(ctx),
  },
];

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

type ProbeStatus = "pass" | "fail" | "skip";

interface ProbeResult {
  adapter: string;
  status: ProbeStatus;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Separator + logging helpers
// ---------------------------------------------------------------------------

function separator(label: string) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(`${line}`);
}

function logResult(r: ProbeResult) {
  if (r.status === "skip") {
    console.log(`  SKIP — env key not set`);
    return;
  }
  if (r.status === "pass") {
    console.log(`  PASS`);
    console.log(`  durationMs   : ${r.durationMs}`);
    console.log(`  inputTokens  : ${r.inputTokens ?? "n/a"}`);
    console.log(`  outputTokens : ${r.outputTokens ?? "n/a"}`);
    console.log(`  costCents    : ${r.costCents !== undefined ? r.costCents.toFixed(4) : "n/a"}`);
    if (r.costCents !== undefined && r.costCents < 0) {
      console.warn(`  WARNING: negative costCents — pricing table entry may be missing`);
    }
  } else {
    console.log(`  FAIL`);
    console.log(`  error: ${r.error}`);
  }
}

// ---------------------------------------------------------------------------
// Single probe runner
// ---------------------------------------------------------------------------

const PROBE_PROMPT = "Reply with exactly the word OK";
const MAX_TOKENS = 100;

async function runProbe(probe: ProbeDescriptor): Promise<ProbeResult> {
  const apiKey = process.env[probe.envKey];
  if (!apiKey || apiKey.trim().length === 0) {
    return { adapter: probe.name, status: "skip" };
  }

  const config: Record<string, unknown> = {
    [probe.configKey]: apiKey.trim(),
    model: probe.model,
    maxTokens: MAX_TOKENS,
  };

  const ctx = makeContext(probe.name, config, PROBE_PROMPT);
  const start = Date.now();

  try {
    const result = await probe.run(ctx);
    const durationMs = Date.now() - start;

    if (result.exitCode !== 0) {
      return {
        adapter: probe.name,
        status: "fail",
        durationMs,
        error: result.errorMessage ?? `exitCode=${result.exitCode} errorCode=${result.errorCode ?? "unknown"}`,
      };
    }

    return {
      adapter: probe.name,
      status: "pass",
      durationMs,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      // costUsd is in dollars; convert to cents
      costCents: result.costUsd !== undefined && result.costUsd !== null ? result.costUsd * 100 : undefined,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return { adapter: probe.name, status: "fail", durationMs, error: message };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("IronWorks HTTP Adapter Integration Test Harness");
  console.log("================================================");
  console.log(`Prompt : ${JSON.stringify(PROBE_PROMPT)}`);
  console.log(`MaxTok : ${MAX_TOKENS}`);
  console.log("");

  const results: ProbeResult[] = [];

  for (const probe of PROBES) {
    separator(`Adapter: ${probe.name}  (model: ${probe.model})`);
    const result = await runProbe(probe);
    logResult(result);
    results.push(result);
  }

  // Summary
  separator("SUMMARY");
  const attempted = results.filter((r) => r.status !== "skip");
  const passed = results.filter((r) => r.status === "pass");
  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");

  for (const r of results) {
    const label = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP";
    console.log(`  ${label.padEnd(6)} ${r.adapter}`);
  }

  console.log("");
  console.log(`${passed.length}/${attempted.length} attempted adapters passed. ${skipped.length} skipped (no key).`);

  if (failed.length > 0) {
    console.log("\nFailed adapters:");
    for (const r of failed) {
      console.log(`  ${r.adapter}: ${r.error}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Harness crashed:", err);
  process.exit(1);
});
