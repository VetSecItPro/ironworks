/**
 * G.5 — CLI helper test: printOpenRouterApiStreamEvent.
 */
import { describe, expect, it, vi } from "vitest";
import { printOpenRouterApiStreamEvent } from "../format-event.js";

describe("printOpenRouterApiStreamEvent", () => {
  it("does nothing for empty / whitespace-only lines", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printOpenRouterApiStreamEvent("   ", false);
    printOpenRouterApiStreamEvent("", false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("in non-debug mode, prints the raw line", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printOpenRouterApiStreamEvent("[openrouter-api] output", false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("[openrouter-api] output");
    spy.mockRestore();
  });

  it("in debug mode, applies cyan for [openrouter-api:event] prefixed lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printOpenRouterApiStreamEvent("[openrouter-api:event] delta", true);
    expect(lines[0]).toContain("[openrouter-api:event]");
    spy.mockRestore();
  });

  it("in debug mode, applies blue for [openrouter-api] prefixed lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printOpenRouterApiStreamEvent("[openrouter-api] log line", true);
    expect(lines[0]).toContain("[openrouter-api]");
    spy.mockRestore();
  });

  it("in debug mode, applies gray for unrecognized lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printOpenRouterApiStreamEvent("raw llm text chunk", true);
    expect(lines[0]).toContain("raw llm text chunk");
    spy.mockRestore();
  });
});
