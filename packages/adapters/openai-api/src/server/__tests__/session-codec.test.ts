import { describe, expect, it } from "vitest";
import { sessionCodec } from "../session-codec.js";

const sampleTurns = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there" },
];

const sampleParams = { turns: sampleTurns };

describe("sessionCodec", () => {
  it("serialize + deserialize round-trips turns", () => {
    const serialized = sessionCodec.serialize(sampleParams);
    expect(serialized).not.toBeNull();
    const deserialized = sessionCodec.deserialize(serialized);
    expect(deserialized).toEqual(sampleParams);
  });

  it("serialize returns null for null input", () => {
    expect(sessionCodec.serialize(null)).toBeNull();
  });

  it("deserialize returns null for null input", () => {
    expect(sessionCodec.deserialize(null)).toBeNull();
  });

  it("getDisplayId returns first 10 chars of a hash (non-null, fixed length)", () => {
    const params = { turns: sampleTurns };
    const displayId = sessionCodec.getDisplayId?.(params);
    expect(displayId).not.toBeNull();
    expect(typeof displayId).toBe("string");
    expect(displayId!.length).toBe(10);
  });

  it("getDisplayId returns different IDs for different transcripts", () => {
    const paramsA = { turns: [{ role: "user", content: "Hello" }] };
    const paramsB = { turns: [{ role: "user", content: "World" }] };
    const idA = sessionCodec.getDisplayId?.(paramsA);
    const idB = sessionCodec.getDisplayId?.(paramsB);
    expect(idA).not.toBe(idB);
  });

  it("getDisplayId returns null for null params", () => {
    expect(sessionCodec.getDisplayId?.(null)).toBeNull();
  });
});
