/**
 * Regression test for SEC-AUTH-CRIT-001 (2026-05-09).
 *
 * The original /api/setup signup flow unconditionally inserted every paying
 * customer into instanceUserRoles as instance_admin, granting cross-tenant
 * admin access (read every other tenant's users / dashboard / audit log,
 * pause/resume any company, modify instance settings). The fix removed the
 * unconditional grant; bootstrap is handled by local_trusted dev mode and
 * the board-claim production flow.
 *
 * This test guards against re-introduction. If the signup route ever needs
 * to insert into instanceUserRoles again, that change MUST go through a
 * security review and update this test with explicit conditions.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SEC-AUTH-CRIT-001 regression — /api/setup must not auto-grant instance_admin", () => {
  const setupSource = readFileSync(resolve(__dirname, "../routes/setup.ts"), "utf8");

  it("does not import instanceUserRoles from @ironworksai/db", () => {
    // Importing the table would let a future commit re-introduce the bug.
    // The fix removed the import; this assertion makes that removal sticky.
    expect(setupSource).not.toMatch(/^import\s*{[^}]*\binstanceUserRoles\b[^}]*}\s*from\s*["']@ironworksai\/db["']/m);
  });

  it("does not contain a literal 'instance_admin' role grant", () => {
    // Catch the most direct re-introduction shape: db.insert(...).values({ role: "instance_admin" }).
    // Comments mentioning the role for documentation purposes are allowed - the assertion targets
    // a string-literal followed by a comma or close-brace, the JSON-value position.
    const literalGrantRegex = /["']instance_admin["']\s*[,}]/;
    expect(setupSource).not.toMatch(literalGrantRegex);
  });
});
