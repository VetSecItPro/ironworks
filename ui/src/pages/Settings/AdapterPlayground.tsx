/**
 * Settings > Adapter Playground.
 *
 * Lets an operator or owner fire a test prompt against any configured provider
 * without creating an agent. Useful for:
 *   - Validating a freshly-saved API key
 *   - Checking that a specific model is reachable
 *   - Exploring temperature / max-token behaviour before locking it into agent config
 *
 * Auth gate: the server enforces operator+ access on the playground endpoint.
 * If the user is a viewer, the submit will return 403 — handled in the UI via
 * an error banner.
 *
 * Streaming: the server emits text/event-stream with typed events:
 *   event: delta   data: { text: string }
 *   event: done    data: { usage: UsageSummary; costUsd: number | null; exitCode: number }
 *   event: error   data: { message: string; code?: string }
 *   event: debug   data: { text: string }
 */

import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProviderStatus } from "../../hooks/useProviderStatus";
import type { HttpAdapterProviderType } from "../../types/providers";
import { SettingsProviderNav } from "./SettingsProviderNav";

// ── Provider + model catalog ──────────────────────────────────────────────────

interface ProviderModelEntry {
  provider: HttpAdapterProviderType;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
}

/**
 * Curated list of models for the playground picker.
 * Kept here rather than fetched dynamically so the playground works even when
 * the adapter's /v1/models endpoint is unreachable (key misconfigured, etc.).
 * When a model ID is sent that the adapter doesn't support, the SSE error
 * event surfaces a clear message.
 */
const PLAYGROUND_MODELS: ProviderModelEntry[] = [
  // Anthropic
  {
    provider: "anthropic_api",
    providerLabel: "Anthropic",
    modelId: "claude-sonnet-4-6",
    modelLabel: "Claude Sonnet 4.6",
  },
  { provider: "anthropic_api", providerLabel: "Anthropic", modelId: "claude-opus-4-7", modelLabel: "Claude Opus 4.7" },
  {
    provider: "anthropic_api",
    providerLabel: "Anthropic",
    modelId: "claude-haiku-4-5",
    modelLabel: "Claude Haiku 4.5",
  },
  // Poe
  {
    provider: "poe_api",
    providerLabel: "Poe",
    modelId: "claude-sonnet-4-6",
    modelLabel: "Claude Sonnet 4.6 (via Poe)",
  },
  { provider: "poe_api", providerLabel: "Poe", modelId: "gpt-5", modelLabel: "GPT-5 (via Poe)" },
  { provider: "poe_api", providerLabel: "Poe", modelId: "gemini-2.5-pro", modelLabel: "Gemini 2.5 Pro (via Poe)" },
  // OpenAI
  { provider: "openai_api", providerLabel: "OpenAI", modelId: "gpt-5", modelLabel: "GPT-5" },
  { provider: "openai_api", providerLabel: "OpenAI", modelId: "gpt-4o", modelLabel: "GPT-4o" },
  { provider: "openai_api", providerLabel: "OpenAI", modelId: "gpt-4o-mini", modelLabel: "GPT-4o mini" },
  // OpenRouter
  {
    provider: "openrouter_api",
    providerLabel: "OpenRouter",
    modelId: "anthropic/claude-sonnet-4.6",
    modelLabel: "Claude Sonnet 4.6 (OR)",
  },
  { provider: "openrouter_api", providerLabel: "OpenRouter", modelId: "openai/gpt-5", modelLabel: "GPT-5 (OR)" },
  {
    provider: "openrouter_api",
    providerLabel: "OpenRouter",
    modelId: "meta-llama/llama-4-scout",
    modelLabel: "Llama 4 Scout (OR)",
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

interface DonePayload {
  exitCode: number;
  usage: UsageSummary | null;
  costUsd: number | null;
}

type PlaygroundState = "idle" | "running" | "done" | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCostUsd(usd: number | null): string {
  if (usd === null) return "n/a";
  if (usd < 0.001) return `$${(usd * 1000).toFixed(4)}m`;
  return `$${usd.toFixed(6)}`;
}

function formatTokens(n: number): string {
  return n.toLocaleString();
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AdapterPlaygroundProps {
  companyId: string;
}

/**
 * Settings > Adapter Playground.
 *
 * Requires operator or owner role. The server enforces this; the UI surfaces
 * a clear error banner if the user's role is insufficient.
 */
export function AdapterPlayground({ companyId }: AdapterPlaygroundProps) {
  // ── Form state ────────────────────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = useState<string>(
    `${PLAYGROUND_MODELS[0].provider}::${PLAYGROUND_MODELS[0].modelId}`,
  );
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(1024);
  const [prompt, setPrompt] = useState<string>("");

  // ── Run state ─────────────────────────────────────────────────────────────
  const [runState, setRunState] = useState<PlaygroundState>("idle");
  const [outputText, setOutputText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [donePayload, setDonePayload] = useState<DonePayload | null>(null);

  // Abort controller so the user can cancel a running call.
  const abortRef = useRef<AbortController | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const parsed = selectedModel.split("::");
  const selectedProvider = (parsed[0] ?? "") as HttpAdapterProviderType;
  const selectedModelId = parsed[1] ?? "";
  const entry = PLAYGROUND_MODELS.find((m) => m.provider === selectedProvider && m.modelId === selectedModelId);

  // Fetch provider status so we can warn if the key is not configured.
  const { status: providerStatus } = useProviderStatus(companyId, selectedProvider);
  const keyMissing = providerStatus !== undefined && !providerStatus.configured;

  // ── SSE runner ────────────────────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    if (!prompt.trim()) return;

    setRunState("running");
    setOutputText("");
    setErrorMessage(null);
    setDonePayload(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`/api/companies/${companyId}/providers/${selectedProvider}/playground`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: selectedModelId,
          temperature,
          maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Response body is empty — expected SSE stream");
      }

      // Parse the SSE stream line by line.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE blocks separated by "\n\n".
        // Use indexOf without assignment-in-while-condition (biome lint compliance).
        while (buffer.includes("\n\n")) {
          const sepIdx = buffer.indexOf("\n\n");
          const block = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);

          let eventType = "message";
          let dataLine = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) dataLine = line.slice(6);
          }

          if (!dataLine) continue;
          const payload = JSON.parse(dataLine) as Record<string, unknown>;

          if (eventType === "delta") {
            const text = payload.text as string;
            setOutputText((prev) => prev + text);
          } else if (eventType === "done") {
            setDonePayload(payload as unknown as DonePayload);
            setRunState("done");
          } else if (eventType === "error") {
            setErrorMessage((payload.message as string | undefined) ?? "Unknown error");
            setRunState("error");
          }
          // "debug" events are intentionally not displayed in the main output pane.
        }
      }

      // If the stream ended without a done or error event, treat it as done.
      if (runState === "running") setRunState("done");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setRunState("idle");
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : "Request failed");
      setRunState("error");
    } finally {
      abortRef.current = null;
    }
  }, [companyId, selectedProvider, selectedModelId, prompt, temperature, maxTokens, runState]);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClear = useCallback(() => {
    setRunState("idle");
    setOutputText("");
    setErrorMessage(null);
    setDonePayload(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const isRunning = runState === "running";
  const hasOutput = outputText.length > 0 || runState === "done" || runState === "error";

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold">Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage API keys and test prompts for HTTP provider adapters.
        </p>
      </div>

      <SettingsProviderNav />

      <div>
        <h2 className="text-base font-medium mb-1">Adapter Playground</h2>
        <p className="text-sm text-muted-foreground">
          Send a test prompt to any configured provider without creating an agent. Useful for validating a new API key
          or comparing model outputs.
        </p>
      </div>

      {/* Configuration card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Model selector */}
          <div className="space-y-1.5">
            <Label htmlFor="playground-model">Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger id="playground-model" className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {(["anthropic_api", "poe_api", "openai_api", "openrouter_api"] as const).map((prov) => {
                  const models = PLAYGROUND_MODELS.filter((m) => m.provider === prov);
                  if (models.length === 0) return null;
                  return (
                    <div key={prov}>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {models[0].providerLabel}
                      </div>
                      {models.map((m) => (
                        <SelectItem key={`${m.provider}::${m.modelId}`} value={`${m.provider}::${m.modelId}`}>
                          {m.modelLabel}
                        </SelectItem>
                      ))}
                    </div>
                  );
                })}
              </SelectContent>
            </Select>

            {/* Key-not-configured warning */}
            {keyMissing && (
              <p className="text-xs text-amber-600 dark:text-amber-400" role="alert">
                No API key configured for {entry?.providerLabel ?? selectedProvider}. Go to{" "}
                <a href="settings/providers" className="underline underline-offset-2">
                  Provider API Keys
                </a>{" "}
                to add one before running.
              </p>
            )}
          </div>

          {/* Temperature slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="playground-temperature">Temperature</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{temperature.toFixed(2)}</span>
            </div>
            <input
              id="playground-temperature"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="Temperature"
              aria-valuenow={temperature}
              aria-valuemin={0}
              aria-valuemax={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 - deterministic</span>
              <span>1 - creative</span>
            </div>
          </div>

          {/* Max tokens slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="playground-max-tokens">Max tokens</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{maxTokens.toLocaleString()}</span>
            </div>
            <input
              id="playground-max-tokens"
              type="range"
              min={64}
              max={4096}
              step={64}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="Max tokens"
              aria-valuenow={maxTokens}
              aria-valuemin={64}
              aria-valuemax={4096}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>64</span>
              <span>4 096</span>
            </div>
          </div>

          {/* Prompt textarea */}
          <div className="space-y-1.5">
            <Label htmlFor="playground-prompt">Prompt</Label>
            <Textarea
              id="playground-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              rows={5}
              disabled={isRunning}
              className="font-mono text-sm resize-y"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <Button type="button" onClick={() => void handleRun()} disabled={!prompt.trim() || keyMissing === true}>
                Run
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={handleAbort}>
                Stop
              </Button>
            )}
            {hasOutput && !isRunning && (
              <Button type="button" variant="ghost" onClick={handleClear}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Output card — shown only when there is something to display */}
      {hasOutput && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Output</CardTitle>
              {runState === "done" && (
                <Badge
                  variant="default"
                  className="bg-green-600/15 text-green-600 dark:text-green-400 border-0 text-xs"
                >
                  Done
                </Badge>
              )}
              {runState === "error" && (
                <Badge variant="destructive" className="text-xs">
                  Error
                </Badge>
              )}
              {isRunning && (
                <Badge variant="muted" className="text-xs animate-pulse">
                  Streaming...
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Streaming text output */}
            {outputText && (
              <pre className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono bg-muted/40 rounded-md p-3 max-h-96 overflow-y-auto">
                {outputText}
                {isRunning && <span className="animate-pulse">|</span>}
              </pre>
            )}

            {/* Error banner */}
            {errorMessage && (
              <div
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            {/* Token + cost readout (shown on completion) */}
            {donePayload && donePayload.exitCode === 0 && (
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-3">
                {donePayload.usage && (
                  <>
                    <span>
                      Input:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatTokens(donePayload.usage.inputTokens)}
                      </span>{" "}
                      tokens
                    </span>
                    {donePayload.usage.cachedInputTokens !== undefined && donePayload.usage.cachedInputTokens > 0 && (
                      <span>
                        Cached:{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {formatTokens(donePayload.usage.cachedInputTokens)}
                        </span>{" "}
                        tokens
                      </span>
                    )}
                    <span>
                      Output:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatTokens(donePayload.usage.outputTokens)}
                      </span>{" "}
                      tokens
                    </span>
                  </>
                )}
                <span>
                  Cost:{" "}
                  <span className="font-medium text-foreground tabular-nums">{formatCostUsd(donePayload.costUsd)}</span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
