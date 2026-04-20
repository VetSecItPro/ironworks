/**
 * HTTP adapter session replay utilities.
 *
 * HTTP adapters are stateless — unlike CLI adapters that own conversation
 * history on disk, every HTTP call must include the full message transcript.
 * This module stores turns in a compact internal shape and formats them into
 * provider-native wire payloads at call time.
 *
 * Session state is stored as a plain JSON-safe object so it can round-trip
 * through `AdapterExecutionResult.sessionParams` without any class instances.
 */

export type Role = "user" | "assistant";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface MessageTurn {
  role: Role;
  content: string | ContentBlock[];
}

export interface SessionState {
  turns: MessageTurn[];
}

export type TranscriptFormat = "openai" | "anthropic";

export interface BuildTranscriptOptions {
  format: TranscriptFormat;
  systemPrompt?: string;
}

/**
 * Return a new SessionState with the turn appended. Input state is not
 * mutated. Safe to call concurrently on the same state snapshot.
 */
export function appendTurn(state: SessionState, turn: MessageTurn): SessionState {
  return { turns: [...state.turns, turn] };
}

/**
 * Format SessionState into the wire shape a provider expects.
 *
 * Two formats:
 * - `openai`: returns `Message[]` with system injected as `role: 'system'` first.
 *   Tool-use blocks on assistant turns become `tool_calls` arrays with arguments
 *   serialized to JSON strings. Tool-result blocks on user turns become separate
 *   `role: 'tool'` messages (one per block), because OpenAI requires them at the
 *   top level rather than as content arrays.
 * - `anthropic`: returns `{ system?: string; messages: Message[] }` because
 *   Anthropic uses a dedicated top-level `system` field rather than a system
 *   role message. Content blocks pass through unchanged — they are already in
 *   Anthropic wire format.
 */
export function buildTranscript(state: SessionState, options: BuildTranscriptOptions): unknown {
  if (options.format === "openai") return buildOpenAiTranscript(state, options.systemPrompt);
  return buildAnthropicTranscript(state, options.systemPrompt);
}

function buildOpenAiTranscript(state: SessionState, systemPrompt: string | undefined): unknown[] {
  const messages: unknown[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const turn of state.turns) {
    if (typeof turn.content === "string") {
      messages.push({ role: turn.role, content: turn.content });
      continue;
    }

    if (turn.role === "assistant") {
      // Split text blocks from tool_use blocks. OpenAI expects tool_use as a
      // top-level tool_calls array rather than content blocks.
      const texts: string[] = [];
      const toolCalls: unknown[] = [];

      for (const block of turn.content) {
        if (block.type === "text") {
          texts.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              // OpenAI requires arguments as a JSON string, not an object
              arguments: JSON.stringify(block.input),
            },
          });
        }
      }

      const msg: Record<string, unknown> = {
        role: "assistant",
        // OpenAI allows null content when tool_calls is present; empty string is
        // rejected by stricter parsers. Use null only when no text blocks exist
        // and tool_calls are present.
        content: texts.length > 0 ? texts.join("") : toolCalls.length > 0 ? null : "",
      };
      if (toolCalls.length > 0) msg.tool_calls = toolCalls;
      messages.push(msg);
      continue;
    }

    // User turn with content blocks: tool_result becomes a role=tool message.
    // Each block maps to its own message because OpenAI does not support
    // content arrays for tool results.
    for (const block of turn.content) {
      if (block.type === "tool_result") {
        messages.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: block.content,
        });
      } else if (block.type === "text") {
        messages.push({ role: "user", content: block.text });
      }
    }
  }

  return messages;
}

function buildAnthropicTranscript(
  state: SessionState,
  systemPrompt: string | undefined,
): { system?: string; messages: unknown[] } {
  // Anthropic content blocks are already in wire format, so turns pass through
  // unchanged. System prompt goes in its own top-level field.
  const messages = state.turns.map((t) => ({ role: t.role, content: t.content }));
  const result: { system?: string; messages: unknown[] } = { messages };
  if (systemPrompt) result.system = systemPrompt;
  return result;
}

/**
 * Serialize session state to a plain JSON-safe object for storage in
 * `AdapterExecutionResult.sessionParams`. The opaque blob is owned entirely
 * by this module — callers treat it as pass-through.
 *
 * Returns a defensive copy: caller mutations of the original state do not
 * corrupt the serialized blob.
 */
export function serializeSession(state: SessionState): Record<string, unknown> {
  // Shallow-clone each turn to prevent caller mutations of original state
  // from affecting the serialized blob.
  return { turns: state.turns.map((t) => ({ ...t })) };
}

/**
 * Deserialize from a `sessionParams` blob back to `SessionState`.
 *
 * Returns a fresh empty state for `null` / `undefined` (first turn in a new
 * conversation). Throws for structurally invalid payloads so bugs surface
 * loudly rather than silently producing wrong transcripts.
 *
 * Validates `role` strictly but does not deep-validate ContentBlock shape
 * inside turns — malformed content blocks surface at buildTranscript time,
 * not deserialize time. Callers that need eager validation should validate
 * before storing.
 */
export function deserializeSession(raw: unknown): SessionState {
  if (raw === null || raw === undefined) return { turns: [] };

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("session params must be an object");
  }

  const turns = (raw as Record<string, unknown>).turns;
  if (!Array.isArray(turns)) {
    throw new Error("session.turns must be an array");
  }

  for (const t of turns) {
    if (typeof t !== "object" || t === null) {
      throw new Error("each turn must be an object");
    }
    const role = (t as Record<string, unknown>).role;
    if (role !== "user" && role !== "assistant") {
      throw new Error(`invalid role: ${String(role)}`);
    }
  }

  return { turns: turns as MessageTurn[] };
}

/**
 * Rough token count for a session using the ~4-chars-per-token heuristic
 * common across OpenAI and Anthropic tokenizers.
 *
 * Intended for compaction gating (deciding when to summarize + truncate old
 * turns), NOT for billing accuracy — billing uses the provider-returned
 * UsageSummary which reflects the actual tokenizer.
 *
 * Uses .length (UTF-16 code units); slightly over-estimates for emoji-heavy
 * content. Accepted heuristic — billing accuracy comes from provider
 * UsageSummary, not this estimate.
 */
export function estimateTokens(state: SessionState, systemPrompt?: string): number {
  let chars = 0;

  if (systemPrompt) chars += systemPrompt.length;

  for (const turn of state.turns) {
    if (typeof turn.content === "string") {
      chars += turn.content.length;
    } else {
      for (const block of turn.content) {
        if (block.type === "text") {
          chars += block.text.length;
        } else if (block.type === "tool_use") {
          // Include both the tool name and serialized input in the estimate
          chars += block.name.length + JSON.stringify(block.input).length;
        } else if (block.type === "tool_result") {
          chars += block.content.length;
        }
      }
    }
  }

  return Math.ceil(chars / 4);
}

/**
 * Caller-supplied summarizer for old turns. Receives the turns to collapse and
 * returns a single summary string. The string will be wrapped in an assistant
 * turn so the model understands it represents prior context.
 *
 * Convention: prefix the returned string with something like
 * "[Previous conversation summary: ...]" so the model recognizes it as
 * compressed history rather than a genuine response.
 */
export type Compactor = (turns: MessageTurn[]) => Promise<string>;

export interface CompactionOptions {
  /** Token budget for the transcript after compaction. Default: 80,000 */
  targetTokens?: number;
  /**
   * Trigger compaction when estimateTokens exceeds this value.
   * Default: targetTokens * 1.5 (i.e. 120,000 for the default 80k target).
   */
  triggerTokens?: number;
  /**
   * Caller-supplied summarizer. When provided, older turns are collapsed into
   * a single summary assistant turn. Falls back to hard truncation when absent
   * or when the summarizer throws.
   */
  compactor?: Compactor;
  /** Optional system prompt included in token accounting. */
  systemPrompt?: string;
  /** Number of most-recent turns to preserve in full. Default: 4 */
  preserveRecent?: number;
}

export type CompactionOutcome = "no-op" | "compacted" | "truncated" | "compactor-failed-truncated";

export interface CompactionResult {
  outcome: CompactionOutcome;
  state: SessionState;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  /** How many turns were collapsed into the summary (0 for no-op / pure truncation). */
  compactedTurnCount: number;
}

/**
 * Compact a session when its estimated token count exceeds the trigger threshold.
 *
 * Strategy:
 * 1. Estimate the current token count. If under the trigger threshold, return no-op.
 * 2. Split turns into [toCompact, toPreserve] where toPreserve = last `preserveRecent`
 *    turns. If there is nothing to compact (too few turns), return no-op.
 * 3. If a compactor is provided, invoke it on the turns to compact and replace them
 *    with a single assistant summary turn. If the resulting state is still over target,
 *    fall through to hard truncation.
 * 4. Hard truncation: drop turns from the front until under targetTokens, but always
 *    keep at least the last `preserveRecent` turns even if that violates the budget.
 *
 * Never mutates the input state.
 */
export async function compactIfNeeded(state: SessionState, options: CompactionOptions = {}): Promise<CompactionResult> {
  const targetTokens = options.targetTokens ?? 80_000;
  const triggerTokens = options.triggerTokens ?? targetTokens * 1.5;
  const preserveRecent = options.preserveRecent ?? 4;
  const { compactor, systemPrompt } = options;

  const before = estimateTokens(state, systemPrompt);

  // Under trigger — nothing to do
  if (before <= triggerTokens) {
    return {
      outcome: "no-op",
      state,
      estimatedTokensBefore: before,
      estimatedTokensAfter: before,
      compactedTurnCount: 0,
    };
  }

  const turns = state.turns;
  const splitAt = turns.length - preserveRecent;

  // Not enough turns to split off anything — preserve recent wins, return no-op
  if (splitAt <= 0) {
    return {
      outcome: "no-op",
      state,
      estimatedTokensBefore: before,
      estimatedTokensAfter: before,
      compactedTurnCount: 0,
    };
  }

  const toCompact = turns.slice(0, splitAt);
  const toPreserve = turns.slice(splitAt);

  // Attempt compactor path first
  if (compactor) {
    try {
      const summary = await compactor(toCompact);
      const summaryTurn: MessageTurn = { role: "assistant", content: summary };
      const compactedState: SessionState = { turns: [summaryTurn, ...toPreserve] };
      const after = estimateTokens(compactedState, systemPrompt);
      // Return 'compacted' whenever the compactor succeeds. Callers that need a
      // stricter budget guarantee should size targetTokens to account for the
      // preserved turns plus an expected summary size.
      return {
        outcome: "compacted",
        state: compactedState,
        estimatedTokensBefore: before,
        estimatedTokensAfter: after,
        compactedTurnCount: toCompact.length,
      };
    } catch {
      // Compactor threw — fall back to truncation with the failure outcome
      return hardTruncate(
        toPreserve,
        before,
        targetTokens,
        preserveRecent,
        systemPrompt,
        "compactor-failed-truncated",
        turns,
      );
    }
  }

  // No compactor — straight to hard truncation
  return hardTruncate(toPreserve, before, targetTokens, preserveRecent, systemPrompt, "truncated", turns);
}

/**
 * Drop turns from the front of `allTurns` until the estimated token count
 * is at or below `targetTokens`, but always keep at least the last
 * `preserveRecent` turns regardless of the budget.
 */
function hardTruncate(
  preserved: MessageTurn[],
  tokensBefore: number,
  targetTokens: number,
  preserveRecent: number,
  systemPrompt: string | undefined,
  outcome: "truncated" | "compactor-failed-truncated",
  allTurns?: MessageTurn[],
): CompactionResult {
  // When the full turn list is provided, attempt to recover extra turns that fit
  // within the budget. Start from the preserved slice and try to include as many
  // older turns as possible, working forward from the most-recent eligible turns.
  const candidates = allTurns ?? preserved;

  // Walk from the front and drop turns until we're under budget, but always
  // keep at least `preserveRecent` turns.
  let remaining = [...candidates];
  while (remaining.length > preserveRecent) {
    const candidate: SessionState = { turns: remaining };
    if (estimateTokens(candidate, systemPrompt) <= targetTokens) break;
    remaining = remaining.slice(1);
  }

  const finalState: SessionState = { turns: remaining };
  const tokensAfter = estimateTokens(finalState, systemPrompt);

  return {
    outcome,
    state: finalState,
    estimatedTokensBefore: tokensBefore,
    estimatedTokensAfter: tokensAfter,
    compactedTurnCount: 0,
  };
}

/** Barrel-compat namespace re-export for adapters that import the whole module. */
export const sessionReplay = {
  appendTurn,
  buildTranscript,
  serializeSession,
  deserializeSession,
  estimateTokens,
  compactIfNeeded,
};
