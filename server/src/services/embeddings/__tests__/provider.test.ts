import { describe, expect, it } from "vitest";
import type { EmbeddingProvider } from "../provider.js";
import { NoOpProvider } from "../providers/noop.js";
import { OllamaProvider } from "../providers/ollama.js";
import { OpenAIProvider } from "../providers/openai.js";

/**
 * Interface-contract sanity checks. Per-provider behavior (HTTP, retries,
 * dim validation) lives in dedicated test files; this file just locks in
 * the shape so a future implementer who adds a new provider can drop it
 * into `providers[]` and immediately catch missing fields.
 */

describe("EmbeddingProvider interface contract", () => {
  const providers: Array<{ label: string; instance: EmbeddingProvider }> = [
    { label: "openai", instance: new OpenAIProvider("sk-test", "text-embedding-3-small") },
    { label: "ollama", instance: new OllamaProvider("http://x", "nomic-embed-text") },
    { label: "noop", instance: new NoOpProvider() },
  ];

  for (const { label, instance } of providers) {
    describe(label, () => {
      it("exposes a stable `name` string", () => {
        expect(typeof instance.name).toBe("string");
        expect(instance.name.length).toBeGreaterThan(0);
      });
      it("exposes a `model` string", () => {
        expect(typeof instance.model).toBe("string");
      });
      it("exposes a numeric `dims`", () => {
        expect(typeof instance.dims).toBe("number");
        expect(Number.isFinite(instance.dims)).toBe(true);
      });
      it("exposes async `embed` and `embedBatch` methods", () => {
        expect(typeof instance.embed).toBe("function");
        expect(typeof instance.embedBatch).toBe("function");
      });
    });
  }
});
