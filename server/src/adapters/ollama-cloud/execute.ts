import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asString } from "../utils.js";
import { sanitizeForPrompt, redactSecrets, PROMPT_MAX_LENGTHS } from "../../lib/prompt-security.js";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, agent, context } = ctx;

  // Get API endpoint and key - check config.apiKey, then env bindings, then process.env
  const apiUrl = asString(config.url, "https://ollama.com/api/chat");
  const envRecord = (config.env && typeof config.env === "object") ? config.env as Record<string, string> : {};
  const apiKey = asString(config.apiKey, envRecord.OLLAMA_API_KEY ?? process.env.OLLAMA_API_KEY ?? "");
  const model = asString(config.model, "kimi-k2.5:cloud");
  const maxTokens = typeof config.maxOutputTokens === "number" ? config.maxOutputTokens : 4096;

  if (!apiKey) {
    throw new Error("Ollama Cloud adapter missing API key (set OLLAMA_API_KEY or configure in agent)");
  }

  // Build messages from context. All context values are unknown — coerce to string safely.
  const messages: Array<{ role: string; content: string }> = [];

  function strVal(v: unknown): string {
    return typeof v === "string" ? v : "";
  }

  // System prompt from DB agent instructions, falling back to legacy promptTemplate in config
  const systemPrompt = strVal(context.systemPrompt) || strVal(context.ironworksSystemPrompt) || strVal(config.promptTemplate);
  const agentInstructions = strVal(context.agentInstructions);
  if (systemPrompt && agentInstructions) {
    messages.push({ role: "system", content: `${systemPrompt}\n\n${agentInstructions}` });
  } else if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  } else if (agentInstructions) {
    messages.push({ role: "system", content: agentInstructions });
  }

  // Morning briefing / session context — redact secrets before sending to external API
  const morningBriefing = redactSecrets(strVal(context.ironworksMorningBriefing));
  if (morningBriefing) {
    messages.push({ role: "system", content: morningBriefing });
  }

  // Onboarding packet for contractors — redact secrets before sending to external API
  const onboardingContext = redactSecrets(strVal(context.ironworksOnboardingContext));
  if (onboardingContext) {
    messages.push({ role: "system", content: onboardingContext });
  }

  // Recent documents — redact secrets before sending to external API
  const recentDocuments = redactSecrets(strVal(context.ironworksRecentDocuments));
  if (recentDocuments) {
    messages.push({ role: "system", content: `## Your Recent Documents\n${recentDocuments}` });
  }

  // The actual task/issue context — sanitize before including in the prompt
  const rawTaskContext = strVal(context.taskContext) || strVal(context.issueContext);
  if (rawTaskContext) {
    const taskContext = sanitizeForPrompt(rawTaskContext, PROMPT_MAX_LENGTHS.taskContext);
    messages.push({ role: "user", content: taskContext });
  }

  // Latest comments/messages — sanitize before including in the prompt
  const rawLatestComment = strVal(context.latestComment);
  if (rawLatestComment) {
    const latestComment = sanitizeForPrompt(rawLatestComment, PROMPT_MAX_LENGTHS.comment);
    messages.push({ role: "user", content: latestComment });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          num_predict: maxTokens,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Ollama Cloud API returned ${res.status}: ${errorText}`);
    }

    const data = await res.json() as {
      message?: { content?: string };
      eval_count?: number;
      prompt_eval_count?: number;
    };

    const responseContent = data.message?.content ?? "";
    const outputTokens = data.eval_count ?? 0;
    const inputTokens = data.prompt_eval_count ?? 0;

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: responseContent,
      model,
      provider: "ollama_cloud",
      usage: {
        inputTokens,
        outputTokens,
      },
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return {
        exitCode: 1,
        signal: "SIGTERM",
        timedOut: true,
        summary: "Ollama Cloud request timed out after 120s",
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
