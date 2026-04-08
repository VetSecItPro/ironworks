import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asString } from "../utils.js";
import { sanitizeForPrompt, redactSecrets, PROMPT_MAX_LENGTHS } from "../../lib/prompt-security.js";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, agent, context } = ctx;

  // Get API endpoint and key - check config.apiKey, then env bindings, then process.env
  const apiUrl = asString(config.url, "https://ollama.com/api/chat");
  const envRecord = (config.env && typeof config.env === "object") ? config.env as Record<string, string> : {};
  const apiKey = asString(config.apiKey, envRecord.OLLAMA_API_KEY ?? process.env.OLLAMA_API_KEY ?? "");
  const primaryModel = asString(config.model, "kimi-k2.5");
  const fallbackModel = asString(config.fallbackModel, "");
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

  // Platform awareness — always-on system context describing all agent capabilities.
  // Injected by injectPlatformAwareness() in heartbeat.ts for every run.
  const platformAwareness = strVal(context.ironworksPlatformAwareness);
  if (platformAwareness) {
    messages.push({ role: "system", content: platformAwareness });
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

  // Channel messages — show the agent what's happening in their channels
  const channelContextKeys = [
    "ironworksCompanyChannelUpdates",
    "ironworksTeamChannelUpdates",
    "ironworksLeadershipChannelUpdates",
  ];
  for (const key of channelContextKeys) {
    const updates = context[key];
    if (Array.isArray(updates) && updates.length > 0) {
      const formatted = updates.map((u: any) =>
        `[${u.at ? new Date(u.at).toLocaleTimeString() : ""}] ${u.author}: ${u.body}`
      ).join("\n");
      messages.push({ role: "system", content: `## Recent Channel Messages\n${formatted}` });
    }
  }

  // Channel posting instruction
  const channelPostingInstruction = strVal(context.ironworksChannelPosting);
  if (channelPostingInstruction) {
    messages.push({ role: "system", content: channelPostingInstruction });
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

  // When there is no task or comment, this is a routine check-in heartbeat.
  // The platform awareness system prompt already primes conversational behavior;
  // the user message just frames what to do with this particular run.
  if (!rawTaskContext && !rawLatestComment) {
    messages.push({
      role: "user",
      content:
        "This is your regular check-in. Review any channel messages in your context, " +
        "respond to teammates as needed, and post a brief status update if you have " +
        "something substantive to share. If nothing requires your attention right now, " +
        "you may skip posting — silence is better than an empty update.",
    });
  }

  // LLM04-A: Enforce an aggregate character cap on the total prompt size.
  // If the assembled messages exceed 100,000 chars, truncate the longest
  // non-system messages (user/assistant) until we're within budget.
  const PROMPT_CHAR_BUDGET = 100_000;
  const totalChars = () => messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars() > PROMPT_CHAR_BUDGET) {
    console.warn(`[ollama-cloud] Prompt size ${totalChars()} chars exceeds budget of ${PROMPT_CHAR_BUDGET}; truncating longest non-system messages`);
    const nonSystem = messages.filter((m) => m.role !== "system");
    // Sort descending by length so we truncate the biggest messages first
    nonSystem.sort((a, b) => b.content.length - a.content.length);
    for (const msg of nonSystem) {
      if (totalChars() <= PROMPT_CHAR_BUDGET) break;
      const excess = totalChars() - PROMPT_CHAR_BUDGET;
      msg.content = msg.content.slice(0, Math.max(0, msg.content.length - excess)) + "\n[content truncated for size]";
    }
  }

  // Try primary model, fall back to fallback model on 404/503
  async function callModel(model: string): Promise<{
    content: string;
    inputTokens: number;
    outputTokens: number;
    usedModel: string;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);

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
          options: { num_predict: maxTokens },
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

      return {
        content: data.message?.content ?? "",
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        usedModel: model,
      };
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw Object.assign(new Error("Ollama Cloud request timed out after 120s"), { timedOut: true });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const result = await callModel(primaryModel);
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: result.content,
      model: result.usedModel,
      provider: "ollama_cloud",
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    };
  } catch (primaryErr) {
    // If primary fails and we have a fallback, try it
    const errMsg = (primaryErr as Error).message ?? "";
    const isRetryable = errMsg.includes("404") || errMsg.includes("503") || errMsg.includes("not found") || errMsg.includes("overloaded");

    if (fallbackModel && isRetryable) {
      try {
        const result = await callModel(fallbackModel);
        return {
          exitCode: 0,
          signal: null,
          timedOut: false,
          summary: result.content,
          model: result.usedModel,
          provider: "ollama_cloud",
          usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        };
      } catch {
        // Fallback also failed - throw original error
      }
    }

    if ((primaryErr as { timedOut?: boolean }).timedOut) {
      return {
        exitCode: 1,
        signal: "SIGTERM",
        timedOut: true,
        summary: "Ollama Cloud request timed out after 120s",
      };
    }
    throw primaryErr;
  }
}
