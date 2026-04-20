import { describe, expect, it } from "vitest";
import { redactAny, redactHeaders, redactStructured } from "../log-redaction.js";

describe("redactAny dispatch", () => {
  it("redacts string using text regex path", () => {
    const result = redactAny("Invalid key: Bearer sk-ant-aaaaaaaaaa");
    expect(typeof result).toBe("string");
    expect(result as string).not.toContain("sk-ant-aaaaaaaaaa");
  });

  it("redacts object using structured path", () => {
    const result = redactAny({ api_key: "sk-ant-secret123", model: "claude" }) as Record<string, string>;
    expect(result.api_key).toBe("[REDACTED]");
    expect(result.model).toBe("claude");
  });

  it("redacts array using structured path", () => {
    const result = redactAny([{ api_key: "x" }, { api_key: "y" }]) as Array<{ api_key: string }>;
    expect(result[0].api_key).toBe("[REDACTED]");
    expect(result[1].api_key).toBe("[REDACTED]");
  });

  it("preserves null", () => {
    expect(redactAny(null)).toBeNull();
  });

  it("preserves undefined", () => {
    expect(redactAny(undefined)).toBeUndefined();
  });

  it("preserves non-string primitives", () => {
    expect(redactAny(42)).toBe(42);
    expect(redactAny(true)).toBe(true);
  });

  it("re-exports redactStructured and redactHeaders", () => {
    expect(typeof redactStructured).toBe("function");
    expect(typeof redactHeaders).toBe("function");
  });
});
