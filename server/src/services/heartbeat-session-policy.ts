import { resolveSessionCompactionPolicy, type SessionCompactionPolicy } from "@ironworksai/adapter-utils";
import type { agents } from "@ironworksai/db";
import type { OutputTokenCategory } from "@ironworksai/shared";
import { DEFAULT_OUTPUT_TOKEN_LIMITS } from "@ironworksai/shared";
import { readNonEmptyString } from "./heartbeat-types.js";

export function parseSessionCompactionPolicy(agent: typeof agents.$inferSelect): SessionCompactionPolicy {
  return resolveSessionCompactionPolicy(agent.adapterType, agent.runtimeConfig).policy;
}

/**
 * Classify the output token category for a heartbeat run based on context.
 * Returns the appropriate max_tokens limit from DEFAULT_OUTPUT_TOKEN_LIMITS.
 */
export function classifyOutputTokenCategory(
  context: Record<string, unknown>,
  source: string | null,
): OutputTokenCategory {
  const issueId = readNonEmptyString(context.issueId);
  const commentId = readNonEmptyString(context.wakeCommentId) ?? readNonEmptyString(context.commentId);
  const wakeReason = readNonEmptyString(context.wakeReason);

  // Routine heartbeat with no new work - keep it brief
  if (source === "timer" && !issueId && !commentId) {
    return "heartbeat_status";
  }

  // Responding to a comment - moderate output
  if (commentId || wakeReason === "issue_comment_mentioned") {
    return "simple_response";
  }

  // Working on an issue (code generation / analysis)
  if (issueId) {
    return "code_generation";
  }

  // Default for other wake types (on_demand, assignment, automation)
  return "code_generation";
}

/**
 * Resolve the max_tokens value for an agent run.
 * Checks agent runtimeConfig for an explicit override, then falls back to
 * the category-based default from DEFAULT_OUTPUT_TOKEN_LIMITS.
 */
export function resolveMaxOutputTokens(
  config: Record<string, unknown>,
  context: Record<string, unknown>,
  source: string | null,
): number {
  // Budget throttle: if 80% of daily gate was hit, the cap was stored in context
  const throttledCap =
    typeof context.ironworksBudgetThrottledTokenCap === "number" && context.ironworksBudgetThrottledTokenCap > 0
      ? context.ironworksBudgetThrottledTokenCap
      : null;
  if (throttledCap) return throttledCap;

  // Allow per-agent override via adapterConfig.maxOutputTokens
  const explicit =
    typeof config.maxOutputTokens === "number" && config.maxOutputTokens > 0 ? config.maxOutputTokens : null;
  if (explicit) return explicit;

  const category = classifyOutputTokenCategory(context, source);
  return DEFAULT_OUTPUT_TOKEN_LIMITS[category];
}
