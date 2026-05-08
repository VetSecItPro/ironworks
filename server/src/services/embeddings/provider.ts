/**
 * Polymorphic embedding-provider abstraction.
 *
 * Why this exists: P0 Memory Upgrade introduces multiple embedding write paths
 * (agent_memory + knowledge_chunks) that may want different providers, models,
 * and dimensionalities. Rather than each call site re-deriving "which model do
 * I use, with which auth header, with which retry policy" from env, every
 * caller resolves a provider via the factory and uses this interface.
 *
 * Implementations (provided in ./providers/*):
 *  - OpenAIProvider - REST `/v1/embeddings` (default 1536-dim, text-embedding-3-small)
 *  - OllamaProvider - REST `/api/embeddings` (default 768-dim, nomic-embed-text)
 *  - NoOpProvider   - stub used when no embedding backend is configured;
 *                     the worker checks `provider.name === "noop"` to skip ticks
 *
 * Contract guarantees:
 *  - `embed` returns a vector whose length === `dims` (implementations validate)
 *  - `embedBatch` returns an array of vectors in the same order as `texts`
 *  - Implementations handle their own retry/timeout policy internally; callers
 *    should treat a thrown error as terminal for that input.
 */

export interface EmbeddingProvider {
  /** Stable provider identifier - e.g. "openai" | "ollama" | "noop". */
  readonly name: string;
  /** Concrete model id passed to the upstream API. */
  readonly model: string;
  /** Vector dimensionality the provider returns. 0 for noop. */
  readonly dims: number;

  /** Embed a single string. Throws on permanent failure (after retries). */
  embed(text: string): Promise<number[]>;

  /**
   * Embed a list of strings. Order preserved. Implementations may chunk or
   * call the underlying API sequentially depending on what the backend
   * supports.
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}
