import { describe, expect, it } from "vitest";
import { buildCompactionArgs, resolveCompactionEnabled } from "./execute.js";

describe("resolveCompactionEnabled", () => {
  it("respects an explicit boolean override", () => {
    expect(resolveCompactionEnabled({ enableCompaction: true })).toBe(true);
    expect(resolveCompactionEnabled({ enableCompaction: false })).toBe(false);
  });

  it("defaults to true when the model is anthropic", () => {
    expect(resolveCompactionEnabled({ model: "claude-opus-4-7" })).toBe(true);
    expect(resolveCompactionEnabled({ model: "Claude-Sonnet-4-6" })).toBe(true);
  });

  it("defaults to true when the model is unspecified", () => {
    expect(resolveCompactionEnabled({})).toBe(true);
  });

  it("defaults to false when a non-anthropic model is configured", () => {
    expect(resolveCompactionEnabled({ model: "gpt-5" })).toBe(false);
    expect(resolveCompactionEnabled({ model: "gemini-3" })).toBe(false);
  });

  it("ignores a non-boolean enableCompaction value", () => {
    expect(resolveCompactionEnabled({ enableCompaction: "yes" })).toBe(true); // falls through to model default
    expect(resolveCompactionEnabled({ enableCompaction: 1 })).toBe(true);
  });
});

describe("buildCompactionArgs", () => {
  it("emits --betas only when compaction is enabled AND billing is api-key", () => {
    expect(buildCompactionArgs(true, "api")).toEqual(["--betas", "compact-2026-01-12"]);
  });

  it("returns [] for subscription auth even with compaction enabled", () => {
    // The Claude CLI restricts --betas passthrough to API-key users; subscription
    // sessions are silently no-op'd server-side, so don't bother passing the flag.
    expect(buildCompactionArgs(true, "subscription")).toEqual([]);
  });

  it("returns [] when compaction is disabled regardless of billing type", () => {
    expect(buildCompactionArgs(false, "api")).toEqual([]);
    expect(buildCompactionArgs(false, "subscription")).toEqual([]);
  });
});
