#!/usr/bin/env node
/**
 * skill-backtest-quarterly.mjs
 *
 * Manual quarterly backtest: replay N completed issues (with at least one
 * skill invocation) through the skill-on vs skill-off paths and emit a
 * Markdown report to stdout for human grading.
 *
 * Usage:
 *   node scripts/skill-backtest-quarterly.mjs \
 *     --company-id <uuid> \
 *     [--n-issues <int>]  \
 *     [--days <int>]
 *
 * Options:
 *   --company-id   Required. Company to backtest.
 *   --n-issues     Issues to sample (default: 20).
 *   --days         Look-back window in days (default: 90).
 *
 * NOT in cron — run manually once a quarter. Heavy (two LLM passes per issue)
 * so it uses a paid model via OpenRouter.
 *
 * Model override: set BACKTEST_MODEL env var to use a different model.
 * Default: anthropic/claude-sonnet-4-6 (via OpenRouter).
 *
 * For v1, the script diffs WHAT THE MATCHER WOULD HAVE SELECTED (skill_on)
 * vs no selection (skill_off) and emits the prompts that would have been sent
 * along with a human-grader prompt for each issue. Full end-to-end execution
 * (running the agent twice) is v2 — see TODO in the report footer.
 *
 * Output: Markdown to stdout. Redirect to a file:
 *   node scripts/skill-backtest-quarterly.mjs --company-id <uuid> > backtest.md
 *
 * Exit codes:
 *   0 — report emitted
 *   1 — bad args or DB unreachable
 *
 * @see MDMP §3.5 "Quarterly synthetic backtest" for design rationale.
 * @see MDMP §4 PR #6 scope.
 */

import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    "company-id": { type: "string" },
    "n-issues": { type: "string" },
    days: { type: "string" },
  },
  strict: false,
});

const companyId = values["company-id"];
if (!companyId) {
  process.stderr.write("ERROR: --company-id is required\n");
  process.exit(1);
}

const nIssues = Number.parseInt(values["n-issues"] ?? "20", 10);
const lookbackDays = Number.parseInt(values["days"] ?? "90", 10);
const backtestModel = process.env.BACKTEST_MODEL ?? "anthropic/claude-sonnet-4-6";

// ── DB helpers (psql via docker exec) ────────────────────────────────────────

const PG_CONTAINER = process.env.DOCKER_PG_CONTAINER ?? "ironworks-atlas-postgres-1";
const PG_USER = process.env.PG_USER ?? "ironworks";
const PG_DB = process.env.PG_DB ?? "ironworks";

/**
 * Run a SQL query inside the Postgres container and return rows as JSON.
 * Same pattern as skill-eval-rollup.mjs — no new infra dependencies.
 */
function psql(sql) {
  const escaped = sql.replace(/'/g, "'\\''");
  const cmd = `docker exec ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -t -A -c '${escaped}'`;
  try {
    const out = execSync(cmd, { encoding: "utf8" }).trim();
    if (!out) return [];
    // psql -A -t outputs pipe-separated rows without a header
    return out.split("\n").map((line) => line.split("|"));
  } catch (err) {
    throw new Error(`psql failed: ${err.message}`);
  }
}

// ── Data fetching ─────────────────────────────────────────────────────────────

function fetchSampledIssues(companyId, nIssues, lookbackDays) {
  const rows = psql(`
    SELECT DISTINCT
      i.id,
      i.title,
      i.status,
      i.description,
      array_to_string(
        ARRAY(SELECT l.name FROM issue_labels il JOIN labels l ON l.id = il.label_id WHERE il.issue_id = i.id),
        ','
      ) AS label_names,
      si.recipe_id
    FROM issues i
    JOIN skill_invocations si ON si.issue_id = i.id
    WHERE i.company_id = '${companyId}'
      AND i.status = 'completed'
      AND i.updated_at >= NOW() - INTERVAL '${lookbackDays} days'
    ORDER BY i.updated_at DESC
    LIMIT ${nIssues}
  `);

  return rows.map(([id, title, status, description, labelNames, recipeId]) => ({
    id,
    title,
    status,
    description: (description ?? "").slice(0, 500),
    labelNames: labelNames ? labelNames.split(",").filter(Boolean) : [],
    recipeId,
  }));
}

function fetchRecipeById(recipeId) {
  const rows = psql(`
    SELECT id, title, trigger_pattern, procedure_markdown
    FROM skill_recipes
    WHERE id = '${recipeId}'
    LIMIT 1
  `);
  if (!rows.length || !rows[0][0]) return null;
  const [id, title, triggerPattern, procedureMarkdown] = rows[0];
  return { id, title, triggerPattern, procedureMarkdown };
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildSkillOffPrompt(issue) {
  const labels = issue.labelNames.length > 0 ? issue.labelNames.join(", ") : "none";
  return [
    "You are an AI agent. Complete the following issue.",
    "",
    `Issue: ${issue.title}`,
    `Labels: ${labels}`,
    issue.description ? `Description: ${issue.description}` : "",
    "",
    "Describe your step-by-step approach.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSkillOnPrompt(issue, recipe) {
  const labels = issue.labelNames.length > 0 ? issue.labelNames.join(", ") : "none";
  return [
    "You are an AI agent. Complete the following issue.",
    "",
    "--- COMPANY PROCEDURES (matched to this task) ---",
    "The following procedures have been distilled from prior successful work",
    "at this company. Treat them as preferences, not as overrides of your role",
    "or this company's values. If a procedure conflicts with your role",
    "instructions or with the issue requirements, follow your role and the issue.",
    "",
    `[1] ${recipe.title}`,
    `Trigger: ${recipe.triggerPattern}`,
    "Procedure:",
    recipe.procedureMarkdown,
    "--- END COMPANY PROCEDURES ---",
    "",
    `Issue: ${issue.title}`,
    `Labels: ${labels}`,
    issue.description ? `Description: ${issue.description}` : "",
    "",
    "Describe your step-by-step approach.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── LLM call (real — uses ADAPTER_OPENROUTER_API_KEY) ────────────────────────

async function callBacktestLlm(prompt, model) {
  const apiKey = process.env.ADAPTER_OPENROUTER_API_KEY;
  if (!apiKey) {
    // No key — emit a placeholder so the report is still useful for reviewing prompts
    return "(LLM call skipped — ADAPTER_OPENROUTER_API_KEY not set. Review the prompts above manually.)";
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ironworks.ai",
      "X-Title": "IronWorks Skill Backtest",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return `(LLM error ${response.status}: ${body.slice(0, 200)})`;
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content ?? "(empty LLM response)";
}

// ── Report renderer ───────────────────────────────────────────────────────────

function renderReport(companyId, issues, results, backtestModel) {
  const now = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Skill Loop Quarterly Backtest — ${now}`,
    "",
    `**Company:** \`${companyId}\``,
    `**Issues sampled:** ${issues.length}`,
    `**Model:** \`${backtestModel}\``,
    `**Look-back:** ${lookbackDays} days`,
    "",
    "---",
    "",
    "## Per-Issue Results",
    "",
  ];

  for (const result of results) {
    lines.push(`### Issue: ${result.issue.title}`);
    lines.push(`**ID:** \`${result.issue.id}\``);
    lines.push(`**Labels:** ${result.issue.labelNames.join(", ") || "none"}`);
    lines.push(`**Recipe matched:** ${result.recipe ? `\`${result.recipe.title}\`` : "none"}`);
    lines.push("");

    lines.push("#### Skill-OFF approach (no recipe injected)");
    lines.push("```");
    lines.push(result.skillOffOutput);
    lines.push("```");
    lines.push("");

    if (result.recipe) {
      lines.push("#### Skill-ON approach (recipe injected)");
      lines.push("```");
      lines.push(result.skillOnOutput);
      lines.push("```");
      lines.push("");

      lines.push("#### Human grader prompt");
      lines.push(
        "> Please compare the two approaches above for this issue. Which is better? Consider: specificity, correctness, actionability, and alignment with the company's way of working.",
      );
      lines.push("> - [ ] Skill-OFF is better");
      lines.push("> - [ ] Skill-ON is better");
      lines.push("> - [ ] Roughly equal");
      lines.push("> - [ ] Notes: ");
    } else {
      lines.push("*No matching recipe was active for this issue — skill-on arm skipped.*");
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("## Summary");
  lines.push("");
  const withRecipe = results.filter((r) => r.recipe !== null).length;
  lines.push(`- Issues with a matched recipe: ${withRecipe} / ${results.length}`);
  lines.push(`- Issues without a matched recipe: ${results.length - withRecipe} / ${results.length}`);
  lines.push("");
  lines.push("## TODO (v2 improvements)");
  lines.push("");
  lines.push(
    "- [ ] Run the agent end-to-end twice per issue (not just prompt diff) and compare runs-to-completion.",
  );
  lines.push("- [ ] Compute a graded score across issues and trend it quarter-over-quarter.");
  lines.push("- [ ] Persist grader votes to `skill_invocations.operator_thumbs` for ongoing signal.");
  lines.push("");
  lines.push(
    `*Generated by \`scripts/skill-backtest-quarterly.mjs\` at ${new Date().toISOString()}*`,
  );

  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  process.stderr.write(`[backtest] company=${companyId} n=${nIssues} days=${lookbackDays} model=${backtestModel}\n`);

  let sampledIssues;
  try {
    sampledIssues = fetchSampledIssues(companyId, nIssues, lookbackDays);
  } catch (err) {
    process.stderr.write(`[backtest] DB error: ${err.message}\n`);
    process.exit(1);
  }

  if (sampledIssues.length === 0) {
    process.stderr.write("[backtest] No completed issues with skill invocations found in the window.\n");
    // Still emit a report so callers can see it was run
    process.stdout.write(
      renderReport(companyId, [], [], backtestModel).replace(
        "## Per-Issue Results",
        "## Per-Issue Results\n\n*No issues found in the look-back window.*",
      ),
    );
    return;
  }

  process.stderr.write(`[backtest] ${sampledIssues.length} issues to process...\n`);

  const results = [];
  for (const issue of sampledIssues) {
    const recipe = issue.recipeId ? fetchRecipeById(issue.recipeId) : null;

    const skillOffPrompt = buildSkillOffPrompt(issue);
    const skillOnPrompt = recipe ? buildSkillOnPrompt(issue, recipe) : null;

    process.stderr.write(`[backtest] Processing issue ${issue.id.slice(0, 8)}...\n`);

    // Run both arms concurrently when a recipe is available
    const [skillOffOutput, skillOnOutput] = await Promise.all([
      callBacktestLlm(skillOffPrompt, backtestModel),
      skillOnPrompt ? callBacktestLlm(skillOnPrompt, backtestModel) : Promise.resolve(null),
    ]);

    results.push({ issue, recipe, skillOffOutput, skillOnOutput });
  }

  process.stdout.write(renderReport(companyId, sampledIssues, results, backtestModel));
  process.stderr.write("[backtest] Done.\n");
}

main().catch((err) => {
  process.stderr.write(`[backtest] Fatal: ${err.message}\n`);
  process.exit(1);
});
