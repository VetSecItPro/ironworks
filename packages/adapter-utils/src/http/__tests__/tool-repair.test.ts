import { describe, expect, it, vi } from "vitest";
import type { ToolInvocation } from "../tool-normalize.js";
import { attemptToolRepair, type RepairOutcome, type RepairPrompter } from "../tool-repair.js";

const schema = {
  type: "object",
  properties: {
    city: { type: "string" },
    units: { type: "string", enum: ["celsius", "fahrenheit"] },
  },
  required: ["city"],
};

describe("attemptToolRepair — successful repair", () => {
  it("returns repaired invocation when retry succeeds", async () => {
    const badInvocation: ToolInvocation = {
      toolCallId: "call_1",
      toolName: "get_weather",
      args: { units: "kelvin" }, // missing city, bad enum
    };
    const repairedInvocation: ToolInvocation = {
      toolCallId: "call_1",
      toolName: "get_weather",
      args: { city: "Paris", units: "celsius" },
    };
    const prompter: RepairPrompter = vi.fn(async () => repairedInvocation);
    const result = await attemptToolRepair(badInvocation, schema, prompter);
    expect(result.outcome).toBe("repaired");
    expect(result.invocation).toEqual(repairedInvocation);
    expect(prompter).toHaveBeenCalledTimes(1);
    // First-attempt errors survive on the 'repaired' outcome so adapter telemetry
    // can log what the model got wrong before self-correcting.
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("passes validation errors to the prompter", async () => {
    const bad: ToolInvocation = {
      toolCallId: "c1",
      toolName: "get_weather",
      args: { units: "kelvin" },
    };
    const prompter = vi.fn<RepairPrompter>(async () => ({
      toolCallId: "c1",
      toolName: "get_weather",
      args: { city: "Paris" },
    }));
    await attemptToolRepair(bad, schema, prompter);
    const call = prompter.mock.calls[0];
    expect(call[0]).toEqual(bad); // original invocation
    expect(call[1]).toEqual(schema); // schema
    expect(call[2].length).toBeGreaterThan(0); // validation errors
  });
});

describe("attemptToolRepair — already-valid args", () => {
  it("returns skipped outcome when args are valid (no repair needed)", async () => {
    const valid: ToolInvocation = {
      toolCallId: "c1",
      toolName: "get_weather",
      args: { city: "Paris" },
    };
    const prompter = vi.fn<RepairPrompter>();
    const result = await attemptToolRepair(valid, schema, prompter);
    expect(result.outcome).toBe("valid");
    expect(result.invocation).toEqual(valid);
    expect(prompter).not.toHaveBeenCalled();
  });
});

describe("attemptToolRepair — repair fails", () => {
  it("returns failed outcome when repaired args still invalid", async () => {
    const bad: ToolInvocation = {
      toolCallId: "c1",
      toolName: "get_weather",
      args: {},
    };
    const prompter: RepairPrompter = vi.fn(async () => ({
      toolCallId: "c1",
      toolName: "get_weather",
      args: { city: 123 as unknown as string }, // still bad
    }));
    const result = await attemptToolRepair(bad, schema, prompter);
    expect(result.outcome).toBe("unrepaired");
    expect(result.invocation).toEqual(bad); // returns original
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns failed outcome when prompter throws", async () => {
    const bad: ToolInvocation = {
      toolCallId: "c1",
      toolName: "get_weather",
      args: {},
    };
    const prompter: RepairPrompter = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await attemptToolRepair(bad, schema, prompter);
    expect(result.outcome).toBe("unrepaired");
    expect(result.invocation).toEqual(bad);
  });
});

describe("attemptToolRepair — single attempt invariant", () => {
  it("invokes prompter at most once regardless of outcome", async () => {
    const bad: ToolInvocation = { toolCallId: "c1", toolName: "get_weather", args: {} };
    const prompter = vi.fn<RepairPrompter>(async () => bad); // returns same bad args
    await attemptToolRepair(bad, schema, prompter);
    expect(prompter).toHaveBeenCalledTimes(1);
  });

  it("prompter returning a different tool name is rejected (repair must preserve toolName)", async () => {
    const bad: ToolInvocation = { toolCallId: "c1", toolName: "get_weather", args: {} };
    const prompter: RepairPrompter = vi.fn(async () => ({
      toolCallId: "c1",
      toolName: "different_tool", // wrong!
      args: { city: "Paris" },
    }));
    const result = await attemptToolRepair(bad, schema, prompter);
    expect(result.outcome).toBe("unrepaired");
  });

  it("prompter returning a different toolCallId is rejected", async () => {
    const bad: ToolInvocation = { toolCallId: "c1", toolName: "get_weather", args: {} };
    const prompter: RepairPrompter = vi.fn(async () => ({
      toolCallId: "different",
      toolName: "get_weather",
      args: { city: "Paris" },
    }));
    const result = await attemptToolRepair(bad, schema, prompter);
    expect(result.outcome).toBe("unrepaired");
  });
});
