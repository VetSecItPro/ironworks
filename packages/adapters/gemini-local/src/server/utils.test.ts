import { describe, expect, it } from "vitest";
import { firstNonEmptyLine } from "./utils.js";

describe("firstNonEmptyLine", () => {
  it("returns the first non-blank trimmed line", () => {
    expect(firstNonEmptyLine("\n\n  hello world  \nsecond")).toBe("hello world");
  });

  it("handles CRLF line endings", () => {
    expect(firstNonEmptyLine("\r\n\r\nfoo\r\nbar")).toBe("foo");
  });

  it("returns empty string when all lines are blank", () => {
    expect(firstNonEmptyLine("\n\n   \n")).toBe("");
    expect(firstNonEmptyLine("")).toBe("");
  });
});
