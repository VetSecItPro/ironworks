/**
 * One-shot tool-call argument repair for HTTP adapters.
 *
 * When a model emits tool_call args that fail schema validation, rather than
 * surfacing failure immediately, this module makes ONE repair attempt by
 * re-prompting the model with the validation errors. If repair succeeds the
 * caller receives the corrected invocation. If repair fails the original
 * invalid invocation is returned so the caller can decide how to surface it.
 *
 * Never more than one repair attempt — prevents infinite retry loops when a
 * model structurally cannot produce conforming args for a given schema.
 */

import { type ToolInvocation, validateToolArgs } from "./tool-normalize.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The three possible outcomes of a repair attempt. */
export type RepairOutcome = "valid" | "repaired" | "unrepaired";

export interface RepairResult {
  outcome: RepairOutcome;
  /**
   * The final invocation to use. For 'valid' and 'repaired' this is safe to
   * dispatch to the tool executor. For 'unrepaired' this is the original
   * invalid invocation — the caller decides whether to surface failure or use
   * it anyway.
   */
  invocation: ToolInvocation;
  /**
   * Validation errors; empty for 'valid', populated for 'repaired' (the first
   * attempt's errors that were sent to the prompter) and 'unrepaired' (the
   * errors from whichever check failed last).
   */
  errors: string[];
}

/**
 * Adapter-supplied repair prompter. Given the invalid invocation, the tool's
 * JSON Schema, and the human-readable validation errors, returns a new
 * ToolInvocation produced by re-prompting the model.
 *
 * Implementations typically re-invoke the provider with an error feedback
 * message (OpenAI: role=tool content with error text; Anthropic: a
 * tool_result content block with `is_error: true`).
 *
 * Errors thrown from this function are caught and treated as 'unrepaired'.
 * The adapter may log or surface those thrown errors through its own channel.
 */
export type RepairPrompter = (
  invalidInvocation: ToolInvocation,
  schema: Record<string, unknown>,
  errors: string[],
) => Promise<ToolInvocation>;

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * One-shot repair loop. Returns immediately ('valid') when args already pass
 * schema validation. Otherwise calls the prompter EXACTLY ONCE with the
 * validation errors and checks the returned invocation.
 *
 * Identity guards: the prompter's returned invocation MUST preserve the
 * original `toolCallId` and `toolName`. A mismatch is treated as 'unrepaired'
 * to prevent silently routing to a different tool with different arguments —
 * a subtle class of bugs that is hard to detect downstream.
 *
 * The single-attempt invariant is load-bearing: callers in retry loops would
 * otherwise create unbounded recursion if the model never converges.
 */
export async function attemptToolRepair(
  invocation: ToolInvocation,
  schema: Record<string, unknown>,
  prompter: RepairPrompter,
): Promise<RepairResult> {
  // Fast path: args are already valid — no repair needed.
  const firstCheck = validateToolArgs(invocation.args, schema);
  if (firstCheck.valid) {
    return { outcome: "valid", invocation, errors: [] };
  }

  // Single repair attempt. Catch any prompter-level failure (network, timeout,
  // provider error) and treat it as 'unrepaired' rather than throwing, so the
  // caller always gets a structured result rather than an uncaught exception.
  let repaired: ToolInvocation;
  try {
    repaired = await prompter(invocation, schema, firstCheck.errors);
  } catch {
    return { outcome: "unrepaired", invocation, errors: firstCheck.errors };
  }

  // Identity guard: repair must target the same tool call. A prompter that
  // returns a different toolCallId or toolName has drifted — likely a bug in
  // the adapter or an unexpected model hallucination.
  if (repaired.toolCallId !== invocation.toolCallId || repaired.toolName !== invocation.toolName) {
    return { outcome: "unrepaired", invocation, errors: firstCheck.errors };
  }

  // Validate the repaired args. If still invalid, return original invocation
  // so callers have the canonical bad payload for error reporting.
  const secondCheck = validateToolArgs(repaired.args, schema);
  if (secondCheck.valid) {
    // Surface the first-attempt errors on a successful repair so callers can
    // log what the model got wrong initially — useful for adapter telemetry
    // ("Model misfired on arg X but self-corrected").
    return { outcome: "repaired", invocation: repaired, errors: firstCheck.errors };
  }

  return { outcome: "unrepaired", invocation, errors: secondCheck.errors };
}

// ---------------------------------------------------------------------------
// Barrel export (namespace style, consistent with other http/* modules)
// ---------------------------------------------------------------------------

export const toolRepair = { attemptToolRepair };
