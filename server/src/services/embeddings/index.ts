/** Barrel for the embedding-provider subsystem. */
export type { EmbeddingProvider } from "./provider.js";
export { NoOpProvider } from "./providers/noop.js";
export { OllamaProvider } from "./providers/ollama.js";
export { OpenAIProvider } from "./providers/openai.js";
export { getChunkProvider, getMemoryProvider } from "./factory.js";
