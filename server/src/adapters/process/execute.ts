import { PROMPT_MAX_LENGTHS, redactSecrets, sanitizeForPrompt } from "../../lib/prompt-security.js";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import {
  asNumber,
  asString,
  asStringArray,
  buildIronworksEnv,
  parseObject,
  redactEnvForLogs,
  runChildProcess,
} from "../utils.js";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, onLog, onMeta, context } = ctx;

  // LLM01-A: Sanitize user-controllable context fields before any downstream use.
  // Even though the process adapter currently passes context via environment (not
  // directly into a prompt), sanitizing here ensures that if args/env templating
  // ever references these fields the values are already clean.
  if (context && typeof context === "object") {
    const ctx2 = context as Record<string, unknown>;
    const strField = (v: unknown) => (typeof v === "string" ? v : "");
    if (strField(ctx2.taskContext)) {
      ctx2.taskContext = sanitizeForPrompt(redactSecrets(strField(ctx2.taskContext)), PROMPT_MAX_LENGTHS.taskContext);
    }
    if (strField(ctx2.latestComment)) {
      ctx2.latestComment = sanitizeForPrompt(redactSecrets(strField(ctx2.latestComment)), PROMPT_MAX_LENGTHS.comment);
    }
    if (strField(ctx2.ironworksMorningBriefing)) {
      ctx2.ironworksMorningBriefing = redactSecrets(strField(ctx2.ironworksMorningBriefing));
    }
    if (strField(ctx2.ironworksOnboardingContext)) {
      ctx2.ironworksOnboardingContext = redactSecrets(strField(ctx2.ironworksOnboardingContext));
    }
    if (strField(ctx2.ironworksRecentDocuments)) {
      ctx2.ironworksRecentDocuments = redactSecrets(strField(ctx2.ironworksRecentDocuments));
    }
  }
  const command = asString(config.command, "");
  if (!command) throw new Error("Process adapter missing command");

  // SEC-TAINT-001: Block arbitrary command execution. Only permit known adapter binaries.
  const ALLOWED_COMMANDS = new Set([
    "claude",
    "codex",
    "opencode",
    "aider",
    "cursor",
    "pi",
    "npx",
    "node",
    "tsx",
    "python",
    "python3",
  ]);
  const basename = command.split("/").pop() ?? "";
  if (!ALLOWED_COMMANDS.has(basename)) {
    throw new Error(`Process adapter command "${basename}" is not in the allowed list. Contact your instance admin.`);
  }

  const args = asStringArray(config.args);
  const cwd = asString(config.cwd, process.cwd());
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = { ...buildIronworksEnv(agent) };
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v === "string") env[k] = v;
  }

  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 15);

  if (onMeta) {
    await onMeta({
      adapterType: "process",
      command,
      cwd,
      commandArgs: args,
      env: redactEnvForLogs(env),
    });
  }

  const proc = await runChildProcess(runId, command, args, {
    cwd,
    env,
    timeoutSec,
    graceSec,
    onLog,
  });

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `Timed out after ${timeoutSec}s`,
    };
  }

  if ((proc.exitCode ?? 0) !== 0) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: false,
      errorMessage: `Process exited with code ${proc.exitCode ?? -1}`,
      resultJson: {
        stdout: proc.stdout,
        stderr: proc.stderr,
      },
    };
  }

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: false,
    resultJson: {
      stdout: proc.stdout,
      stderr: proc.stderr,
    },
  };
}
