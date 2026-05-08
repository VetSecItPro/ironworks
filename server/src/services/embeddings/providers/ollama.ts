import type { EmbeddingProvider } from "../provider.js";
import { fetchWithRetry, type RetryOptions } from "./http-retry.js";

/**
 * Ollama `/api/embeddings` provider.
 *
 * Defaults to `nomic-embed-text` (768 dims). The endpoint is taken from the
 * caller (factory reads OLLAMA_CLOUD_URL) so the same class works for both
 * localhost and Ollama Cloud.
 *
 * Auth: Ollama Cloud requires `Authorization: Bearer <key>`; localhost
 * usually does not. The apiKey is therefore optional.
 *
 * Batch behavior: the `/api/embeddings` REST endpoint accepts a single
 * prompt per request - there is no batched form here. We loop sequentially.
 * (Note: a separate `/api/embed` endpoint accepts arrays and is used by
 * server/src/services/ollama-embed.ts; that path stays as-is for legacy
 * knowledge_chunks until we migrate it. This provider deliberately uses the
 * documented public REST shape so callers can also point it at localhost
 * Ollama for offline dev.)
 */

const DEFAULT_MODEL = "nomic-embed-text";

const KNOWN_DIMS: Record<string, number> = {
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
};

interface OllamaEmbeddingResponse {
  embedding?: number[];
}

export interface OllamaProviderOptions {
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  dims?: number;
}

export class OllamaProvider implements EmbeddingProvider {
  readonly name = "ollama" as const;
  readonly model: string;
  readonly dims: number;

  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly retryOpts: RetryOptions;

  constructor(
    baseUrl: string,
    model: string = DEFAULT_MODEL,
    apiKey?: string,
    options: OllamaProviderOptions = {},
  ) {
    if (!baseUrl) {
      throw new Error("OllamaProvider requires a non-empty baseUrl");
    }
    this.baseUrl = baseUrl;
    this.model = model;
    this.apiKey = apiKey;
    this.dims = options.dims ?? KNOWN_DIMS[model] ?? 768;
    this.retryOpts = {
      providerName: "ollama",
      timeoutMs: options.timeoutMs,
      sleep: options.sleep,
    };
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.request({ prompt: text, model: this.model });
    const vec = res.embedding;
    if (!vec || vec.length === 0) {
      throw new Error("ollama: response had no embedding");
    }
    this.validateDims(vec);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama's REST `/api/embeddings` is single-prompt; we serialize.
    // Concurrency would help throughput but risks tripping rate limits on
    // shared deployments, so we keep it sequential and conservative.
    const out: number[][] = [];
    for (const text of texts) {
      out.push(await this.embed(text));
    }
    return out;
  }

  private async request(body: unknown): Promise<OllamaEmbeddingResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    const res = await fetchWithRetry(
      this.baseUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      this.retryOpts,
    );
    return (await res.json()) as OllamaEmbeddingResponse;
  }

  private validateDims(vec: number[]): void {
    if (vec.length !== this.dims) {
      throw new Error(
        `ollama: embedding dim mismatch - got ${vec.length}, expected ${this.dims} (model=${this.model})`,
      );
    }
  }
}
