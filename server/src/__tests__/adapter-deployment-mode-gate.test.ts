import { CLOUD_ADAPTER_TYPES, LOCAL_PROCESS_ADAPTER_TYPES } from "@ironworksai/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  __setDeploymentModeForTest,
  assertAdapterTypeAllowedForDeployment,
  getDeploymentMode,
} from "../deployment-mode.js";
import { agentService } from "../services/agents.js";

afterEach(() => {
  __setDeploymentModeForTest(undefined);
  delete process.env.IRONWORKS_DEPLOYMENT_MODE;
});

describe("assertAdapterTypeAllowedForDeployment", () => {
  it("rejects every local-process adapter in authenticated mode", () => {
    for (const adapterType of LOCAL_PROCESS_ADAPTER_TYPES) {
      expect(() => assertAdapterTypeAllowedForDeployment(adapterType, "authenticated")).toThrow(/local child process/i);
    }
  });

  it("allows every cloud adapter in authenticated mode", () => {
    for (const adapterType of CLOUD_ADAPTER_TYPES) {
      expect(() => assertAdapterTypeAllowedForDeployment(adapterType, "authenticated")).not.toThrow();
    }
  });

  it("allows local-process adapters in local_trusted mode (single-tenant self-host)", () => {
    for (const adapterType of LOCAL_PROCESS_ADAPTER_TYPES) {
      expect(() => assertAdapterTypeAllowedForDeployment(adapterType, "local_trusted")).not.toThrow();
    }
  });

  it("fails closed on unknown adapter types in authenticated mode", () => {
    expect(() => assertAdapterTypeAllowedForDeployment("mystery-adapter", "authenticated")).toThrow();
  });

  it("consults the active deployment mode when none is passed explicitly", () => {
    __setDeploymentModeForTest("authenticated");
    expect(() => assertAdapterTypeAllowedForDeployment("process")).toThrow();
    __setDeploymentModeForTest("local_trusted");
    expect(() => assertAdapterTypeAllowedForDeployment("process")).not.toThrow();
  });
});

describe("getDeploymentMode", () => {
  it("defaults to local_trusted with no boot value and no env override", () => {
    expect(getDeploymentMode()).toBe("local_trusted");
  });

  it("falls back to the IRONWORKS_DEPLOYMENT_MODE env var", () => {
    process.env.IRONWORKS_DEPLOYMENT_MODE = "authenticated";
    expect(getDeploymentMode()).toBe("authenticated");
  });

  it("ignores an invalid env value and stays permissive", () => {
    process.env.IRONWORKS_DEPLOYMENT_MODE = "bogus";
    expect(getDeploymentMode()).toBe("local_trusted");
  });

  it("test override takes precedence over the env var", () => {
    process.env.IRONWORKS_DEPLOYMENT_MODE = "authenticated";
    __setDeploymentModeForTest("local_trusted");
    expect(getDeploymentMode()).toBe("local_trusted");
  });
});

describe("agentService gate wiring", () => {
  // The gate is the first statement of create() and update(), so it throws
  // before any DB access - the unconnected stub db below is never reached.
  const svc = agentService({} as never);

  it("create rejects a process-adapter agent in authenticated mode", async () => {
    __setDeploymentModeForTest("authenticated");
    await expect(
      svc.create("company-1", { name: "Ada", role: "engineer", adapterType: "process" } as never),
    ).rejects.toThrow(/local child process/i);
  });

  it("create rejects a claude_local agent in authenticated mode", async () => {
    __setDeploymentModeForTest("authenticated");
    await expect(
      svc.create("company-1", { name: "Ada", role: "engineer", adapterType: "claude_local" } as never),
    ).rejects.toThrow();
  });

  it("update rejects switching an agent onto a local-process adapter in authenticated mode", async () => {
    __setDeploymentModeForTest("authenticated");
    await expect(svc.update("agent-1", { adapterType: "process" } as never)).rejects.toThrow(/local child process/i);
  });
});
