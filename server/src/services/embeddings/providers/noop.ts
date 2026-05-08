import type { EmbeddingProvider } from "../provider.js";

/**
 * NoOpProvider - used when no embedding backend is configured (env unset, or
 * provider=openai but OPENAI_API_KEY missing).
 *
 * Both `embed` and `embedBatch` throw a descriptive error so accidental use
 * is loud. The recommended pattern is for callers (e.g. the embedding worker)
 * to short-circuit on `provider.name === "noop"` and skip the tick rather
 * than hit the throw. The throw is the safety net.
 */
export class NoOpProvider implements EmbeddingProvider {
  readonly name = "noop" as const;
  readonly model = "noop" as const;
  readonly dims = 0;

  private static readonly MESSAGE = "EmbeddingProvider not configured (provider=noop)";

  async embed(_text: string): Promise<number[]> {
    throw new Error(NoOpProvider.MESSAGE);
  }

  async embedBatch(_texts: string[]): Promise<number[][]> {
    throw new Error(NoOpProvider.MESSAGE);
  }
}
