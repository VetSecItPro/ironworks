/**
 * G.5 — CLI helper test: printAnthropicApiStreamEvent.
 */
import { describe, expect, it, vi } from "vitest";
import { printAnthropicApiStreamEvent } from "../format-event.js";

describe("printAnthropicApiStreamEvent", () => {
  it("does nothing for empty / whitespace-only lines", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printAnthropicApiStreamEvent("   ", false);
    printAnthropicApiStreamEvent("", false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("in non-debug mode, prints the raw line", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printAnthropicApiStreamEvent("[anthropic-api] output", false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("[anthropic-api] output");
    spy.mockRestore();
  });

  it("in debug mode, applies cyan for [anthropic-api:event] prefixed lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printAnthropicApiStreamEvent("[anthropic-api:event] delta", true);
    expect(lines[0]).toContain("[anthropic-api:event]");
    spy.mockRestore();
  });

  it("in debug mode, applies blue for [anthropic-api] prefixed lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printAnthropicApiStreamEvent("[anthropic-api] log line", true);
    expect(lines[0]).toContain("[anthropic-api]");
    spy.mockRestore();
  });

  it("in debug mode, applies gray for unrecognized lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printAnthropicApiStreamEvent("raw llm text chunk", true);
    expect(lines[0]).toContain("raw llm text chunk");
    spy.mockRestore();
  });
});
