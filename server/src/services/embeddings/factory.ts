import { logger } from "../../middleware/logger.js";
import type { EmbeddingProvider } from "./provider.js";
import { NoOpProvider } from "./providers/noop.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenAIProvider } from "./providers/openai.js";

/**
 * Env-driven provider factory.
 *
 * Two distinct call sites today, each with its own env vars so they can be
 * tuned independently:
 *
 *  - getMemoryProvider() - agent_memory write path. Default `noop` (off)
 *    until operators opt in by setting IRONWORKS_MEMORY_EMBEDDING_PROVIDER.
 *
 *  - getChunkProvider()  - knowledge_chunks write path. Default `ollama` to
 *    preserve the existing knowledge-RAG behavior; flipping a chunk
 *    deployment to OpenAI is a single env change.
 *
 * Degrade-to-noop policy: if `provider=openai` is set but OPENAI_API_KEY is
 * missing, we WARN ONCE per (call-site, key) pair and return NoOpProvider.
 * This is preferable to throwing on import - a misconfigured deployment
 * still boots; it just doesn't embed until the operator fixes the env.
 */

const warnedKeys = new Set<string>();

function warnOnce(key: string, msg: string, ctx: Record<string, unknown>): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  logger.warn(ctx, msg);
}

/** Reset the warn-once memo. Test-only - exported for vitest. */
export function __resetEmbeddingFactoryWarnings(): void {
  warnedKeys.clear();
}

interface ResolveOptions {
  /** Logical call site (used as warn-once dedupe key). */
  site: "memory" | "chunk";
  providerEnv: string;
  modelEnv: string;
  /** Default provider when the providerEnv is unset. */
  defaultProvider: "openai" | "ollama" | "noop";
}

function resolve(opts: ResolveOptions): EmbeddingProvider {
  const provider = (process.env[opts.providerEnv] ?? opts.defaultProvider).toLowerCase();
  const model = process.env[opts.modelEnv];

  switch (provider) {
    case "openai": {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        warnOnce(
          `${opts.site}:openai:no-key`,
          `embedding factory: ${opts.site} provider set to openai but OPENAI_API_KEY is missing - degrading to noop`,
          { site: opts.site, providerEnv: opts.providerEnv },
        );
        return new NoOpProvider();
      }
      return new OpenAIProvider(key, model);
    }
    case "ollama": {
      const url = process.env.OLLAMA_CLOUD_URL ?? "http://localhost:11434/api/embeddings";
      const apiKey = process.env.OLLAMA_API_KEY;
      return new OllamaProvider(url, model, apiKey);
    }
    case "noop":
      return new NoOpProvider();
    default: {
      warnOnce(
        `${opts.site}:unknown:${provider}`,
        `embedding factory: unknown provider "${provider}" for ${opts.site} - degrading to noop`,
        { site: opts.site, provider, providerEnv: opts.providerEnv },
      );
      return new NoOpProvider();
    }
  }
}

/** Provider for the agent_memory write path. */
export function getMemoryProvider(): EmbeddingProvider {
  return resolve({
    site: "memory",
    providerEnv: "IRONWORKS_MEMORY_EMBEDDING_PROVIDER",
    modelEnv: "IRONWORKS_MEMORY_EMBEDDING_MODEL",
    defaultProvider: "noop",
  });
}

/** Provider for the knowledge_chunks write path. */
export function getChunkProvider(): EmbeddingProvider {
  return resolve({
    site: "chunk",
    providerEnv: "IRONWORKS_CHUNK_EMBEDDING_PROVIDER",
    modelEnv: "IRONWORKS_CHUNK_EMBEDDING_MODEL",
    defaultProvider: "ollama",
  });
}
