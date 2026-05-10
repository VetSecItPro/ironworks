// SEC-AUTH-HIGH-002 — viewer-write protection regression test.
//
// Static-analysis style guard: every non-GET handler in any route file that
// scopes a request to a `:companyId` URL parameter MUST be gated by either
// `assertCanWrite` (the viewer-write gate) OR a stronger gate that already
// implies write permission (instance admin, owner, RBAC permission, etc.).
//
// If you add a new mutating company-scoped handler and skip this gate, this
// test will fail with the offending file + path printed for triage.
//
// Discovery rule: any file under server/src/routes (excluding tests, the
// authz helper itself, the index aggregator, and a curated allow-list of
// files that gate at the helper-level) is parsed; every
// `router.{post,put,patch,delete}("/:.../`:companyId`/...)` is scanned and
// its handler block (between the matching `{` / `}`) is required to mention
// at least one of the allowed gates.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES_DIR = path.resolve(__dirname, "..", "routes");

/** Helper functions whose presence in a handler block satisfies the write gate. */
const ALLOWED_GATES: readonly string[] = [
  "assertCanWrite", // canonical viewer-write gate
  "assertOwner", // strictly stronger
  "assertInstanceAdmin", // admin-tier
  "assertCompanyPermission", // RBAC; viewers lack write permissions
  "assertCanCreateAgentsForCompany",
  "assertCanReadConfigurations", // alias of the above (returns same value)
  "assertCanGenerateOpenClawInvitePrompt",
  "assertCanMutateCompanySkills",
  "assertBoardCanAssignTasks",
  "assertCanManageExistingRoutine", // patched to call assertCanWrite internally
  "assertCanManageIssueApprovalLinks", // patched to call assertCanWrite internally
  "assertCanManageInstructionsPath", // patched to call assertCanWrite internally
  "assertCanUpdateAgent", // patched to call assertCanWrite internally
  "assertCanUpdateBranding", // patched to call assertCanWrite internally
  "assertCanManagePortability", // patched to call assertCanWrite internally
];

/** Files we skip wholesale because they are public/bootstrap or test-only. */
const SKIP_FILES = new Set<string>([
  "authz.ts",
  "index.ts",
  "health.ts",
  "access-route-helpers.ts", // helpers, no router handlers
  "agent-route-helpers.ts", // helpers, no router handlers
]);

const HANDLER_RE = /router\.(post|put|patch|delete)\(\s*"([^"]+)"/g;

interface Handler {
  file: string;
  method: string;
  routePath: string;
  block: string;
}

/** Parse a route file and return every non-GET handler block. */
function extractHandlers(file: string, src: string): Handler[] {
  const handlers: Handler[] = [];
  for (const match of src.matchAll(HANDLER_RE)) {
    const method = match[1]!;
    const routePath = match[2]!;
    const startIdx = match.index ?? -1;
    if (startIdx < 0) continue;
    // Walk forward from the start of the match to the first `{` after the
    // route path declaration, then count braces until the matching close.
    const openBraceIdx = src.indexOf("{", startIdx);
    if (openBraceIdx < 0) continue;
    let depth = 1;
    let i = openBraceIdx + 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      i += 1;
    }
    const block = src.slice(openBraceIdx, i);
    handlers.push({ file, method, routePath, block });
  }
  return handlers;
}

describe("viewer-write protection (SEC-AUTH-HIGH-002)", () => {
  const files = readdirSync(ROUTES_DIR).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !SKIP_FILES.has(name),
  );

  it("inventory is non-empty (smoke test)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    it(`every mutating company-scoped handler in ${file} is gated`, () => {
      const src = readFileSync(path.join(ROUTES_DIR, file), "utf8");
      const handlers = extractHandlers(file, src);
      const offenders: string[] = [];
      for (const h of handlers) {
        // Only consider handlers that take a :companyId URL param. Routes that
        // operate on a different identifier (e.g. /:id, /:agentId) typically
        // look up the entity, then assert against the resolved companyId via
        // one of the allowed gates; those still need the gate, but they cannot
        // be matched by URL inspection alone, so we only static-check the
        // company-scoped routes here.
        if (!h.routePath.includes(":companyId")) continue;
        if (h.method === "get") continue;
        const gated = ALLOWED_GATES.some((gate) => h.block.includes(`${gate}(`));
        if (!gated) {
          offenders.push(`${h.method.toUpperCase()} ${h.routePath}`);
        }
      }
      expect(offenders, `Missing write gate in ${file}: ${offenders.join(", ")}`).toEqual([]);
    });
  }
});
