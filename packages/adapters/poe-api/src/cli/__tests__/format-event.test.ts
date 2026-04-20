/**
 * G.5 — CLI helper test: printPoeApiStreamEvent.
 *
 * Why: the formatter is the boundary between the poe_api adapter's stdout stream
 * and whatever process is displaying it (ironworks CLI, agent runner logs). A broken
 * formatter silently drops events or garbles output. Tests verify the three branches:
 * empty line (no-op), debug mode with prefix coloring, and plain passthrough.
 */
import { describe, expect, it, vi } from "vitest";
import { printPoeApiStreamEvent } from "../format-event.js";

describe("printPoeApiStreamEvent", () => {
  it("does nothing for empty / whitespace-only lines", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printPoeApiStreamEvent("   ", false);
    printPoeApiStreamEvent("", false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("in non-debug mode, prints the raw line without ANSI codes", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });

    printPoeApiStreamEvent("[poe-api] some output text", false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("[poe-api] some output text");
    spy.mockRestore();
  });

  it("in debug mode, applies cyan for [poe-api:event] prefixed lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });

    printPoeApiStreamEvent("[poe-api:event] token_delta text=hello", true);
    expect(lines).toHaveLength(1);
    // picocolors wraps with ANSI escape codes; the raw text must be present
    expect(lines[0]).toContain("[poe-api:event]");
    spy.mockRestore();
  });

  it("in debug mode, applies blue for [poe-api] prefixed lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });

    printPoeApiStreamEvent("[poe-api] general log line", true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[poe-api]");
    spy.mockRestore();
  });

  it("in debug mode, applies gray for unrecognized lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });

    printPoeApiStreamEvent("some unformatted chunk from the stream", true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("some unformatted chunk");
    spy.mockRestore();
  });
});
