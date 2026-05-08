import { describe, expect, it } from "vitest";
import { NoOpProvider } from "../providers/noop.js";

describe("NoOpProvider", () => {
  it("identifies as noop with 0 dims", () => {
    const p = new NoOpProvider();
    expect(p.name).toBe("noop");
    expect(p.model).toBe("noop");
    expect(p.dims).toBe(0);
  });

  it("throws a descriptive error from embed()", async () => {
    const p = new NoOpProvider();
    await expect(p.embed("hi")).rejects.toThrow(/not configured.*noop/);
  });

  it("throws a descriptive error from embedBatch()", async () => {
    const p = new NoOpProvider();
    await expect(p.embedBatch(["a", "b"])).rejects.toThrow(/not configured.*noop/);
  });
});
