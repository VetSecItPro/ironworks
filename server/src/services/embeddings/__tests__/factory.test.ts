import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetEmbeddingFactoryWarnings,
  getChunkProvider,
  getMemoryProvider,
} from "../factory.js";
import { NoOpProvider } from "../providers/noop.js";
import { OllamaProvider } from "../providers/ollama.js";
import { OpenAIProvider } from "../providers/openai.js";

vi.mock("../../../middleware/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const RELEVANT_ENV = [
  "IRONWORKS_MEMORY_EMBEDDING_PROVIDER",
  "IRONWORKS_MEMORY_EMBEDDING_MODEL",
  "IRONWORKS_CHUNK_EMBEDDING_PROVIDER",
  "IRONWORKS_CHUNK_EMBEDDING_MODEL",
  "OPENAI_API_KEY",
  "OLLAMA_CLOUD_URL",
  "OLLAMA_API_KEY",
] as const;

describe("embedding factory", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of RELEVANT_ENV) originalEnv[k] = process.env[k];
    for (const k of RELEVANT_ENV) delete process.env[k];
    __resetEmbeddingFactoryWarnings();
  });
  afterEach(() => {
    for (const k of RELEVANT_ENV) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
  });

  describe("getMemoryProvider", () => {
    it("returns NoOpProvider when no env is set (default = noop)", () => {
      const p = getMemoryProvider();
      expect(p).toBeInstanceOf(NoOpProvider);
    });

    it("returns OpenAIProvider when provider=openai and key present", () => {
      process.env.IRONWORKS_MEMORY_EMBEDDING_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-test";
      const p = getMemoryProvider();
      expect(p).toBeInstanceOf(OpenAIProvider);
      expect(p.name).toBe("openai");
      expect(p.model).toBe("text-embedding-3-small");
      expect(p.dims).toBe(1536);
    });

    it("respects IRONWORKS_MEMORY_EMBEDDING_MODEL override", () => {
      process.env.IRONWORKS_MEMORY_EMBEDDING_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.IRONWORKS_MEMORY_EMBEDDING_MODEL = "text-embedding-3-large";
      const p = getMemoryProvider();
      expect(p.model).toBe("text-embedding-3-large");
      expect(p.dims).toBe(3072);
    });

    it("degrades to NoOp when provider=openai but OPENAI_API_KEY missing", () => {
      process.env.IRONWORKS_MEMORY_EMBEDDING_PROVIDER = "openai";
      const p = getMemoryProvider();
      expect(p).toBeInstanceOf(NoOpProvider);
    });

    it("returns OllamaProvider when provider=ollama (default localhost url)", () => {
      process.env.IRONWORKS_MEMORY_EMBEDDING_PROVIDER = "ollama";
      const p = getMemoryProvider();
      expect(p).toBeInstanceOf(OllamaProvider);
      expect(p.model).toBe("nomic-embed-text");
      expect(p.dims).toBe(768);
    });

    it("returns OllamaProvider with custom url + key when env set", () => {
      process.env.IRONWORKS_MEMORY_EMBEDDING_PROVIDER = "ollama";
      process.env.OLLAMA_CLOUD_URL = "https://example.com/api/embeddings";
      process.env.OLLAMA_API_KEY = "tok-1";
      const p = getMemoryProvider();
      expect(p).toBeInstanceOf(OllamaProvider);
    });

    it("explicit provider=noop returns NoOpProvider", () => {
      process.env.IRONWORKS_MEMORY_EMBEDDING_PROVIDER = "noop";
      const p = getMemoryProvider();
      expect(p).toBeInstanceOf(NoOpProvider);
    });

    it("unknown provider value degrades to NoOpProvider", () => {
      process.env.IRONWORKS_MEMORY_EMBEDDING_PROVIDER = "magic";
      const p = getMemoryProvider();
      expect(p).toBeInstanceOf(NoOpProvider);
    });
  });

  describe("getChunkProvider", () => {
    it("defaults to OllamaProvider when no env is set (preserves existing behavior)", () => {
      const p = getChunkProvider();
      expect(p).toBeInstanceOf(OllamaProvider);
      expect(p.dims).toBe(768);
    });

    it("respects IRONWORKS_CHUNK_EMBEDDING_PROVIDER=openai", () => {
      process.env.IRONWORKS_CHUNK_EMBEDDING_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-test";
      const p = getChunkProvider();
      expect(p).toBeInstanceOf(OpenAIProvider);
    });

    it("memory and chunk are independent", () => {
      process.env.IRONWORKS_MEMORY_EMBEDDING_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.IRONWORKS_CHUNK_EMBEDDING_PROVIDER = "ollama";

      const mem = getMemoryProvider();
      const chunk = getChunkProvider();
      expect(mem.name).toBe("openai");
      expect(chunk.name).toBe("ollama");
    });
  });
});
