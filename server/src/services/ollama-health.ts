import type { Db } from "@ironworksai/db";
import { agents } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { findCompanyChannel, postMessage } from "./channels.js";

/**
 * Daily health check: verify that every agent's configured Ollama Cloud model
 * is still available on the Ollama Cloud API. If a model disappears or is renamed,
 * post an alert to #company so the board can reconfigure.
 */
export async function checkOllamaModelHealth(db: Db): Promise<void> {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) return; // No Ollama Cloud configured

  // Fetch available models
  let availableModels: Set<string>;
  try {
    const res = await fetch("https://ollama.com/api/tags", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "ollama-health: failed to fetch model list");
      return;
    }
    const data = (await res.json()) as { models: Array<{ name: string; model: string }> };
    availableModels = new Set(data.models.map((m) => m.model || m.name));
  } catch (err) {
    logger.warn({ err }, "ollama-health: failed to reach Ollama Cloud API");
    return;
  }

  // Check each ollama_cloud agent's model
  const ollamaAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      companyId: agents.companyId,
      adapterConfig: agents.adapterConfig,
    })
    .from(agents)
    .where(eq(agents.adapterType, "ollama_cloud"));

  const mismatches: Array<{ agentName: string; model: string; companyId: string }> = [];

  for (const agent of ollamaAgents) {
    const config = agent.adapterConfig as Record<string, unknown> | null;
    const model = (config?.model as string) ?? "";
    if (!model) continue;

    if (!availableModels.has(model)) {
      mismatches.push({ agentName: agent.name, model, companyId: agent.companyId });
    }
  }

  if (mismatches.length === 0) {
    logger.info({ checkedCount: ollamaAgents.length }, "ollama-health: all agent models available");
    return;
  }

  // Group by company and alert
  const byCompany = new Map<string, typeof mismatches>();
  for (const m of mismatches) {
    const list = byCompany.get(m.companyId) ?? [];
    list.push(m);
    byCompany.set(m.companyId, list);
  }

  for (const [companyId, agents] of byCompany) {
    const channel = await findCompanyChannel(db, companyId);
    if (!channel) continue;

    const agentList = agents.map((a) => `- ${a.agentName}: model "${a.model}" not found`).join("\n");
    await postMessage(db, {
      channelId: channel.id,
      companyId,
      body: `**Model Health Alert:** The following agents have models that are no longer available on Ollama Cloud:\n\n${agentList}\n\nPlease update their model configuration in Settings or Agent Detail.`,
      messageType: "escalation",
    }).catch((err) => {
      logger.warn({ err, companyId }, "ollama-health: failed to post alert");
    });
  }

  logger.warn(
    { mismatchCount: mismatches.length, agents: mismatches.map((m) => `${m.agentName}:${m.model}`) },
    "ollama-health: model mismatches detected",
  );
}
