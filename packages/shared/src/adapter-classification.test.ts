import { describe, expect, it } from "vitest";
import {
  AGENT_ADAPTER_TYPES,
  CLOUD_ADAPTER_TYPES,
  isLocalProcessAdapterType,
  LOCAL_PROCESS_ADAPTER_TYPES,
} from "./constants.js";

describe("agent adapter classification", () => {
  it("partitions AGENT_ADAPTER_TYPES exactly - every type classified, none twice", () => {
    const local = new Set<string>(LOCAL_PROCESS_ADAPTER_TYPES);
    const cloud = new Set<string>(CLOUD_ADAPTER_TYPES);

    // Disjoint: no adapter is both a local-process and a cloud adapter.
    for (const t of local) expect(cloud.has(t)).toBe(false);

    // Exhaustive: every adapter type lands in exactly one bucket. If a new
    // adapter is added to AGENT_ADAPTER_TYPES without being classified, this
    // fails - which is the point: an unclassified adapter must not ship.
    for (const t of AGENT_ADAPTER_TYPES) {
      expect(local.has(t) || cloud.has(t)).toBe(true);
    }
    expect(local.size + cloud.size).toBe(AGENT_ADAPTER_TYPES.length);

    // No stray entries that are not real adapter types.
    for (const t of [...local, ...cloud]) {
      expect((AGENT_ADAPTER_TYPES as readonly string[]).includes(t)).toBe(true);
    }
  });

  it("isLocalProcessAdapterType is true for every local-process adapter", () => {
    for (const t of LOCAL_PROCESS_ADAPTER_TYPES) {
      expect(isLocalProcessAdapterType(t)).toBe(true);
    }
  });

  it("isLocalProcessAdapterType is false for every cloud adapter", () => {
    for (const t of CLOUD_ADAPTER_TYPES) {
      expect(isLocalProcessAdapterType(t)).toBe(false);
    }
  });

  it("fails closed - unknown adapter types are treated as local-process", () => {
    // getServerAdapter() falls back to the process adapter for unknown types,
    // so an unrecognized type must be classified as code-executing.
    expect(isLocalProcessAdapterType("totally-unknown")).toBe(true);
    expect(isLocalProcessAdapterType("")).toBe(true);
  });
});
