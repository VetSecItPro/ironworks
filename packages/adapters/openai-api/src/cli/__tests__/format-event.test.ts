/**
 * G.5 — CLI helper test: printOpenAIApiStreamEvent.
 */
import { describe, expect, it, vi } from "vitest";
import { printOpenAIApiStreamEvent } from "../format-event.js";

describe("printOpenAIApiStreamEvent", () => {
  it("does nothing for empty / whitespace-only lines", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printOpenAIApiStreamEvent("   ", false);
    printOpenAIApiStreamEvent("", false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("in non-debug mode, prints the raw line", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printOpenAIApiStreamEvent("[openai-api] output", false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("[openai-api] output");
    spy.mockRestore();
  });

  it("in debug mode, applies cyan for [openai-api:event] prefixed lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printOpenAIApiStreamEvent("[openai-api:event] delta", true);
    expect(lines[0]).toContain("[openai-api:event]");
    spy.mockRestore();
  });

  it("in debug mode, applies blue for [openai-api] prefixed lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printOpenAIApiStreamEvent("[openai-api] log line", true);
    expect(lines[0]).toContain("[openai-api]");
    spy.mockRestore();
  });

  it("in debug mode, applies gray for unrecognized lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    printOpenAIApiStreamEvent("raw llm text chunk", true);
    expect(lines[0]).toContain("raw llm text chunk");
    spy.mockRestore();
  });
});
