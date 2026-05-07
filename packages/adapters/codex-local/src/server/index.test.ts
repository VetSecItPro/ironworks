import { describe, expect, it } from "vitest";
import * as serverModule from "./index.js";

describe("codex-local server module", () => {
  it("loads without throwing and exposes expected entry points", () => {
    expect(typeof serverModule.execute).toBe("function");
    expect(typeof serverModule.parseCodexJsonl).toBe("function");
    expect(typeof serverModule.isCodexUnknownSessionError).toBe("function");
    expect(typeof serverModule.testEnvironment).toBe("function");
    expect(serverModule.sessionCodec).toBeDefined();
  });
});

describe("codex-local sessionCodec", () => {
  const { sessionCodec } = serverModule;

  it("deserializes snake_case and camelCase session params", () => {
    expect(sessionCodec.deserialize({ session_id: "thread_1", workdir: "/repo" })).toEqual({
      sessionId: "thread_1",
      cwd: "/repo",
    });
    expect(sessionCodec.deserialize({ sessionId: "thread_2", cwd: "/r", repoUrl: "git@x:y.git" })).toEqual({
      sessionId: "thread_2",
      cwd: "/r",
      repoUrl: "git@x:y.git",
    });
  });

  it("returns null when session id is missing or input is non-object", () => {
    expect(sessionCodec.deserialize({ cwd: "/r" })).toBeNull();
    expect(sessionCodec.deserialize(null)).toBeNull();
    expect(sessionCodec.deserialize("nope")).toBeNull();
    expect(sessionCodec.deserialize([])).toBeNull();
  });

  it("getDisplayId surfaces the session id (or null)", () => {
    const getDisplayId = sessionCodec.getDisplayId;
    if (!getDisplayId) throw new Error("codex-local sessionCodec must implement getDisplayId");
    expect(getDisplayId({ sessionId: "thread_a" })).toBe("thread_a");
    expect(getDisplayId(null)).toBeNull();
    expect(getDisplayId({})).toBeNull();
  });
});
