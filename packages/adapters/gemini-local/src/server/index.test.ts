import { describe, expect, it } from "vitest";
import * as serverModule from "./index.js";

describe("gemini-local server module", () => {
  it("loads without throwing and exposes expected entry points", () => {
    expect(typeof serverModule.execute).toBe("function");
    expect(typeof serverModule.parseGeminiJsonl).toBe("function");
    expect(typeof serverModule.isGeminiUnknownSessionError).toBe("function");
    expect(typeof serverModule.testEnvironment).toBe("function");
    expect(serverModule.sessionCodec).toBeDefined();
  });
});

describe("gemini-local sessionCodec", () => {
  const { sessionCodec } = serverModule;

  it("deserializes session_id / sessionId / sessionID variants", () => {
    expect(sessionCodec.deserialize({ sessionID: "s1" })).toEqual({ sessionId: "s1" });
    expect(sessionCodec.deserialize({ session_id: "s2", workdir: "/r" })).toEqual({
      sessionId: "s2",
      cwd: "/r",
    });
    expect(sessionCodec.deserialize({ sessionId: "s3" })).toEqual({ sessionId: "s3" });
  });

  it("returns null for missing session id or non-object input", () => {
    expect(sessionCodec.deserialize({})).toBeNull();
    expect(sessionCodec.deserialize(null)).toBeNull();
    expect(sessionCodec.deserialize([])).toBeNull();
  });

  it("getDisplayId returns the session id or null", () => {
    const getDisplayId = sessionCodec.getDisplayId;
    if (!getDisplayId) throw new Error("gemini-local sessionCodec must implement getDisplayId");
    expect(getDisplayId({ sessionId: "s2" })).toBe("s2");
    expect(getDisplayId(null)).toBeNull();
    expect(getDisplayId({})).toBeNull();
  });
});
