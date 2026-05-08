import type { EmbeddingProvider } from "../provider.js";
import { fetchWithRetry, type RetryOptions } from "./http-retry.js";

/**
 * OpenAI `/v1/embeddings` provider.
 *
 * Defaults to `text-embedding-3-small` (1536 dims) - cheap, fast, the
 * spec-default for the memory write path when OPENAI_API_KEY is configured.
 *
 * Batch behavior: OpenAI accepts up to 2048 inputs per request. We chunk to
 * 256 to keep request payloads predictable and stay well under per-request
 * size limits when individual texts are large.
 *
 * Dim validation: every returned embedding must match `this.dims`. A
 * mismatch indicates a model swap or an upstream protocol change and we
 * fail loudly rather than persist garbage vectors.
 */

const ENDPOINT = "https://api.openai.com/v1/embeddings";
const BATCH_SIZE = 256;

const KNOWN_DIMS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  model?: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export interface OpenAIProviderOptions {
  /** Override per-attempt timeout (default 30s). Tests inject a smaller value. */
  timeoutMs?: number;
  /** Sleep injection point for fake timers. */
  sleep?: (ms: number) => Promise<void>;
  /** Override-able dimensionality (e.g. when using a model not in KNOWN_DIMS). */
  dims?: number;
}

export class OpenAIProvider implements EmbeddingProvider {
  readonly name = "openai" as const;
  readonly model: string;
  readonly dims: number;

  private readonly apiKey: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    apiKey: string,
    model: string = "text-embedding-3-small",
    options: OpenAIProviderOptions = {},
  ) {
    if (!apiKey) {
      throw new Error("OpenAIProvider requires a non-empty apiKey");
    }
    this.apiKey = apiKey;
    this.model = model;
    this.dims = options.dims ?? KNOWN_DIMS[model] ?? 1536;
    this.retryOpts = {
      providerName: "openai",
      timeoutMs: options.timeoutMs,
      sleep: options.sleep,
    };
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.request({ input: text, model: this.model });
    const vec = res.data?.[0]?.embedding;
    if (!vec) {
      throw new Error("openai: response had no embedding");
    }
    this.validateDims(vec);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const out: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const chunk = texts.slice(start, start + BATCH_SIZE);
      const res = await this.request({ input: chunk, model: this.model });
      const data = res.data ?? [];
      if (data.length !== chunk.length) {
        throw new Error(
          `openai: batch returned ${data.length} embeddings for ${chunk.length} inputs`,
        );
      }
      // OpenAI's response includes an `index` field; sort by it just in case
      // upstream ever returns out of order. Default index is positional.
      const sorted = [...data].sort(
        (a, b) => (a.index ?? 0) - (b.index ?? 0),
      );
      for (const item of sorted) {
        if (!item.embedding) {
          throw new Error("openai: batch response had a missing embedding");
        }
        this.validateDims(item.embedding);
        out.push(item.embedding);
      }
    }
    return out;
  }

  private async request(body: unknown): Promise<OpenAIEmbeddingResponse> {
    const res = await fetchWithRetry(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      this.retryOpts,
    );
    return (await res.json()) as OpenAIEmbeddingResponse;
  }

  private validateDims(vec: number[]): void {
    if (vec.length !== this.dims) {
      throw new Error(
        `openai: embedding dim mismatch - got ${vec.length}, expected ${this.dims} (model=${this.model})`,
      );
    }
  }
}
