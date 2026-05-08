import { describe, expect, it } from "vitest";
import {
  instanceGeneralSettingsSchema,
  instanceNotesSettingsSchema,
  patchInstanceGeneralSettingsSchema,
  patchInstanceNotesSettingsSchema,
} from "../instance.js";

describe("instanceNotesSettingsSchema", () => {
  it("applies defaults when both keys absent", () => {
    const parsed = instanceNotesSettingsSchema.parse({});
    // persistRunNotes defaults false (run notes are noisy / opt-in)
    expect(parsed.persistRunNotes).toBe(false);
    // persistDecisionNotes defaults true (decisions are higher-signal)
    expect(parsed.persistDecisionNotes).toBe(true);
  });

  it("round-trips fully-populated input unchanged", () => {
    const input = { persistRunNotes: true, persistDecisionNotes: false };
    expect(instanceNotesSettingsSchema.parse(input)).toEqual(input);
  });

  it("partial input gets defaulted on absent keys", () => {
    expect(instanceNotesSettingsSchema.parse({ persistRunNotes: true })).toEqual({
      persistRunNotes: true,
      persistDecisionNotes: true,
    });
  });
});

describe("instanceGeneralSettingsSchema notes section", () => {
  it("notes is optional at the top level", () => {
    const parsed = instanceGeneralSettingsSchema.parse({});
    expect(parsed.notes).toBeUndefined();
  });

  it("accepts notes when provided", () => {
    const parsed = instanceGeneralSettingsSchema.parse({
      notes: { persistRunNotes: true, persistDecisionNotes: false },
    });
    expect(parsed.notes).toEqual({ persistRunNotes: true, persistDecisionNotes: false });
  });
});

describe("patchInstanceGeneralSettingsSchema notes section", () => {
  it("does not materialize notes when absent (PATCH semantics)", () => {
    const parsed = patchInstanceGeneralSettingsSchema.parse({});
    expect("notes" in parsed && parsed.notes !== undefined).toBe(false);
  });

  it("accepts a partial notes patch (only one inner key)", () => {
    const parsed = patchInstanceGeneralSettingsSchema.parse({
      notes: { persistRunNotes: true },
    });
    expect(parsed.notes).toEqual({ persistRunNotes: true });
    // Inner default must NOT be injected — service layer owns merge defaults.
    expect((parsed.notes as Record<string, unknown>).persistDecisionNotes).toBeUndefined();
  });

  it("patchInstanceNotesSettingsSchema accepts empty object without injecting defaults", () => {
    const parsed = patchInstanceNotesSettingsSchema.parse({});
    expect(parsed).toEqual({});
  });
});
