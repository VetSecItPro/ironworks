import { describe, expect, it } from "vitest";
import { createRequestId, extractRequestId, getOrCreateRequestId } from "../request-id.js";

describe("createRequestId", () => {
  it("returns a UUID v4 string", () => {
    const id = createRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("returns unique IDs on repeated calls", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(createRequestId());
    expect(ids.size).toBe(1000);
  });
});

describe("getOrCreateRequestId", () => {
  it("returns a new ID when no context provided", () => {
    const id = getOrCreateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });

  it("returns existing ID from context", () => {
    const existing = "abc12345-def6-4890-8abc-def123456789";
    const id = getOrCreateRequestId({ requestId: existing });
    expect(id).toBe(existing);
  });

  it("creates a new ID when context has requestId=undefined", () => {
    const id = getOrCreateRequestId({ requestId: undefined });
    expect(id).not.toBe("undefined");
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });

  it("validates an external request ID and creates a new one if invalid", () => {
    const id = getOrCreateRequestId({ requestId: "not-a-uuid" });
    expect(id).not.toBe("not-a-uuid");
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });
});

describe("extractRequestId (from response headers)", () => {
  it("reads x-request-id header (lowercase)", () => {
    const id = extractRequestId({ "x-request-id": "server-generated-id-123" });
    expect(id).toBe("server-generated-id-123");
  });

  it("reads X-Request-Id header (case-insensitive)", () => {
    const id = extractRequestId({ "X-Request-Id": "abc" });
    expect(id).toBe("abc");
  });

  it("reads request-id without x- prefix", () => {
    const id = extractRequestId({ "request-id": "abc" });
    expect(id).toBe("abc");
  });

  it("returns undefined when no request ID header present", () => {
    expect(extractRequestId({})).toBeUndefined();
    expect(extractRequestId({ "other-header": "x" })).toBeUndefined();
  });

  it("prefers x-request-id over request-id when both present", () => {
    const id = extractRequestId({
      "x-request-id": "x-prefix",
      "request-id": "no-prefix",
    });
    expect(id).toBe("x-prefix");
  });

  it("handles array-valued headers (undici returns string[] for repeated headers)", () => {
    expect(extractRequestId({ "x-request-id": ["trace-1", "trace-2"] })).toBe("trace-1");
  });

  it("handles empty array header", () => {
    expect(extractRequestId({ "x-request-id": [] })).toBeUndefined();
  });
});
