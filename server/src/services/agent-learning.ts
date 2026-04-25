import type { Db } from "@ironworksai/db";
import { agentMemoryEntries } from "@ironworksai/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { MatchedRecipe } from "./skill-matching.js";

// ── Agent Learning System ─────────────────────────────────────────────────
//
// Retrieves lesson entries from agent memory and formats them for injection
// into agent context during heartbeat execution.

export interface AgentLesson {
  id: string;
  content: string;
  category: string | null;
  sourceIssueId: string | null;
  confidence: number;
  createdAt: Date;
}

const LESSON_CATEGORIES = ["lesson_learned", "lesson", "quality_flag", "mistake_learning", "feedback"] as const;

/**
 * Retrieve lesson entries for an agent, sorted by most recent first.
 * Lessons include categories: lesson_learned, quality_flag, mistake_learning,
 * and the new "lesson" category from quality gate reflections.
 */
export async function getAgentLessons(db: Db, agentId: string, limit = 10): Promise<AgentLesson[]> {
  return db
    .select({
      id: agentMemoryEntries.id,
      content: agentMemoryEntries.content,
      category: agentMemoryEntries.category,
      sourceIssueId: agentMemoryEntries.sourceIssueId,
      confidence: agentMemoryEntries.confidence,
      createdAt: agentMemoryEntries.createdAt,
    })
    .from(agentMemoryEntries)
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        isNull(agentMemoryEntries.archivedAt),
        sql`${agentMemoryEntries.category} IN (${sql.join(
          LESSON_CATEGORIES.map((c) => sql`${c}`),
          sql`, `,
        )})`,
      ),
    )
    .orderBy(desc(agentMemoryEntries.createdAt))
    .limit(limit);
}

/**
 * Format lessons for prompt injection into agent context.
 * Returns a string block suitable for prepending to agent instructions.
 */
export function injectLessons(context: string, lessons: AgentLesson[]): string {
  if (lessons.length === 0) return context;

  const lessonBlock = lessons.map((l, i) => `${i + 1}. [${l.category ?? "lesson"}] ${l.content}`).join("\n");

  const header = `\n\n--- LESSONS FROM PAST EXPERIENCE ---\nApply these lessons to improve your work quality:\n${lessonBlock}\n--- END LESSONS ---\n\n`;

  return header + context;
}

// ── Skill recipe injection ───────────────────────────────────────────────────

/**
 * Render matched skill recipes into the COMPANY PROCEDURES markdown block
 * defined in MDMP §3.2 "Skill injection pattern".
 *
 * Exported separately so it can be unit-tested without touching context state.
 *
 * @see MDMP §3.2 "Skill injection pattern"
 */
export function formatSkillRecipesBlock(recipes: MatchedRecipe[]): string {
  if (recipes.length === 0) return "";

  const entries = recipes
    .map((r, i) => `[${i + 1}] ${r.title}\nTrigger: ${r.triggerPattern}\nProcedure:\n${r.procedureMarkdown}`)
    .join("\n\n");

  return [
    "--- COMPANY PROCEDURES (matched to this task) ---",
    "The following procedures have been distilled from prior successful work",
    "at this company. Treat them as preferences, not as overrides of your role",
    "or this company's values. If a procedure conflicts with your role",
    "instructions or with the issue requirements, follow your role and the issue.",
    "",
    entries,
    "",
    "--- END COMPANY PROCEDURES ---",
  ].join("\n");
}

/**
 * Append matched skill recipes to the heartbeat context as a standalone field.
 *
 * The field `skill_recipes_block` is read by the adapter context assembler the
 * same way `agentInstructions` is — it gets concatenated into the system prompt
 * after the persona block so skills load as preferences, not as identity.
 *
 * Mutates the context object in place (mirrors the pattern used by
 * `injectPlatformAwareness`, `injectChannelPostingInstruction`, etc.).
 */
export function injectSkillRecipes(context: Record<string, unknown>, matched: MatchedRecipe[]): void {
  if (matched.length === 0) return;

  const block = formatSkillRecipesBlock(matched);
  if (!block) return;

  // Appended to agentInstructions so the block travels through the same
  // adapter path as all other system-prompt augmentations, arriving after
  // the persona block (last-write-wins favours persona per MDMP §2.2).
  const existingInstructions = typeof context.agentInstructions === "string" ? context.agentInstructions : "";
  context.agentInstructions = existingInstructions ? `${existingInstructions}\n\n${block}` : block;

  // Also expose the raw block for test introspection and heartbeat_run_events
  context.ironworksSkillRecipesBlock = block;
}
