import type { BaseFrontmatter } from "./base.js";

/**
 * Frontmatter for a heartbeat run (one agent invocation). Captures the
 * who/what/when/result of the run plus the trigger source and exit code so
 * a vault reader can audit run history.
 */
export interface RunFrontmatter extends BaseFrontmatter {
  type: "run";
  agent_id: string;
  /** "scheduled" | "on_demand" | "wakeup" | "retry" | ... */
  invocation_source: string;
  trigger_detail?: string;
  /** "queued" | "running" | "succeeded" | "failed" | "cancelled" | ... */
  status: string;
  /** ISO 8601 timestamp. */
  started_at?: string;
  /** ISO 8601 timestamp. */
  finished_at?: string;
  exit_code?: number;
  error_code?: string;
  retry_of_run_id?: string;
}
