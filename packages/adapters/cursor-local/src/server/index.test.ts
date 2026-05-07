import { describe, expect, it } from "vitest";
import * as serverModule from "./index.js";

describe("cursor-local server module", () => {
  it("loads without throwing and exposes expected entry points", () => {
    expect(typeof serverModule.execute).toBe("function");
    expect(typeof serverModule.parseCursorJsonl).toBe("function");
    expect(typeof serverModule.isCursorUnknownSessionError).toBe("function");
    expect(typeof serverModule.testEnvironment).toBe("function");
    expect(serverModule.sessionCodec).toBeDefined();
  });
});

describe("cursor-local sessionCodec", () => {
  const { sessionCodec } = serverModule;

  it("deserializes session_id / sessionId / sessionID variants", () => {
    expect(sessionCodec.deserialize({ sessionID: "sess_1" })).toEqual({ sessionId: "sess_1" });
    expect(sessionCodec.deserialize({ session_id: "sess_2", folder: "/work" })).toEqual({
      sessionId: "sess_2",
      cwd: "/work",
    });
  });

  it("returns null for missing session id or non-object input", () => {
    expect(sessionCodec.deserialize({})).toBeNull();
    expect(sessionCodec.deserialize(null)).toBeNull();
    expect(sessionCodec.deserialize([])).toBeNull();
  });

  it("serialize round-trips a populated session", () => {
    const out = sessionCodec.serialize({ sessionId: "sess_3", cwd: "/r", workspaceId: "ws_1" });
    expect(out).toEqual({ sessionId: "sess_3", cwd: "/r", workspaceId: "ws_1" });
  });
});
