/**
 * Session codec for openai_api adapter.
 *
 * OpenAI's Chat Completions API is stateless (R17): conversation state lives entirely in
 * IronWorks. Session params carry the full MessageTurn transcript for replay on each call.
 *
 * The display ID is the first 10 hex characters of SHA-256(JSON.stringify(turns)).
 * This gives a stable, human-readable label without exposing conversation content
 * in the UI and without requiring server-side session storage.
 */

import { createHash } from "node:crypto";
import type { AdapterSessionCodec } from "@ironworksai/adapter-utils";

function readTurns(params: Record<string, unknown>): unknown[] | null {
  const turns = params.turns;
  if (!Array.isArray(turns)) return null;
  return turns;
}

/**
 * Derive a short display ID from the transcript content.
 * First 10 hex chars of SHA-256 gives ~40 bits of collision resistance —
 * sufficient for display purposes; not used for any security invariant.
 */
function transcriptDisplayId(turns: unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(turns)).digest("hex");
  return digest.slice(0, 10);
}

export const sessionCodec: AdapterSessionCodec = {
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!params) return null;
    const turns = readTurns(params);
    if (!turns) return null;
    return { turns };
  },

  deserialize(raw: unknown): Record<string, unknown> | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const turns = readTurns(record);
    if (!turns) return null;
    return { turns };
  },

  getDisplayId(params: Record<string, unknown> | null): string | null {
    if (!params) return null;
    const turns = readTurns(params);
    if (!turns || turns.length === 0) return null;
    return transcriptDisplayId(turns);
  },
};
