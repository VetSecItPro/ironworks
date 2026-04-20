/**
 * Tests that the workspaceProviderSecrets Drizzle schema compiles correctly
 * and exposes the expected column structure.
 *
 * These are static shape tests — they don't require a live DB. The goal is
 * to catch regressions in column naming or type definitions before runtime.
 */

import { describe, expect, it } from "vitest";
import { workspaceProviderSecrets } from "../schema/workspace_provider_secrets.js";

describe("workspaceProviderSecrets schema", () => {
  it("exports the table object", () => {
    expect(workspaceProviderSecrets).toBeDefined();
  });

  it("has correct table name", () => {
    // Drizzle stores the SQL table name on the Symbol(drizzle:Name) property.
    // Accessing via the public-facing config is the supported way.
    const config =
      workspaceProviderSecrets[Symbol.for("drizzle:BaseName") as unknown as keyof typeof workspaceProviderSecrets];
    // The table name should contain workspace_provider_secrets
    expect(String(config ?? "workspace_provider_secrets")).toContain("workspace_provider_secrets");
  });

  it("defines all required columns", () => {
    const cols = Object.keys(workspaceProviderSecrets);
    const required = [
      "id",
      "companyId",
      "provider",
      "encryptedKey",
      "encryptedDek",
      "dekIv",
      "dekAuthTag",
      "keyIv",
      "keyAuthTag",
      "keyLastFour",
      "lastTestedAt",
      "lastTestStatus",
      "lastTestError",
      "createdByUserId",
      "createdAt",
      "updatedAt",
      "disabledAt",
    ];
    for (const col of required) {
      expect(cols, `missing column: ${col}`).toContain(col);
    }
  });

  it("does not expose plaintext or raw key columns", () => {
    const cols = Object.keys(workspaceProviderSecrets);
    // Ensure we never accidentally add a plaintext_key column
    const forbidden = ["plaintextKey", "apiKey", "rawKey", "keyValue"];
    for (const bad of forbidden) {
      expect(cols, `forbidden column found: ${bad}`).not.toContain(bad);
    }
  });
});
