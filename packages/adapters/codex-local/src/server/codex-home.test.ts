import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveManagedCodexHomeDir, resolveSharedCodexHomeDir } from "./codex-home.js";

describe("resolveSharedCodexHomeDir", () => {
  it("honors CODEX_HOME when set", () => {
    expect(resolveSharedCodexHomeDir({ CODEX_HOME: "/tmp/codex-shared" })).toBe(path.resolve("/tmp/codex-shared"));
  });

  it("falls back to ~/.codex when CODEX_HOME is unset or empty", () => {
    expect(resolveSharedCodexHomeDir({})).toBe(path.join(os.homedir(), ".codex"));
    expect(resolveSharedCodexHomeDir({ CODEX_HOME: "   " })).toBe(path.join(os.homedir(), ".codex"));
  });
});

describe("resolveManagedCodexHomeDir", () => {
  it("places company-scoped homes under instances/<id>/companies/<companyId>/codex-home", () => {
    const dir = resolveManagedCodexHomeDir(
      { IRONWORKS_HOME: "/srv/ironworks", IRONWORKS_INSTANCE_ID: "prod" },
      "company_42",
    );
    expect(dir).toBe(path.resolve("/srv/ironworks/instances/prod/companies/company_42/codex-home"));
  });

  it("uses the default instance id when IRONWORKS_INSTANCE_ID is unset", () => {
    const dir = resolveManagedCodexHomeDir({ IRONWORKS_HOME: "/srv/ironworks" }, "company_1");
    expect(dir).toBe(path.resolve("/srv/ironworks/instances/default/companies/company_1/codex-home"));
  });

  it("returns an instance-level home when no companyId is supplied", () => {
    const dir = resolveManagedCodexHomeDir({ IRONWORKS_HOME: "/srv/ironworks" });
    expect(dir).toBe(path.resolve("/srv/ironworks/instances/default/codex-home"));
  });
});
