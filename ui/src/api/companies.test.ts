import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { companiesApi } from "./companies";

// Verifies the wizard's terminal Launch action issues a single round-trip to
// the new transactional endpoint instead of the prior 7+ chained calls.
describe("companiesApi.onboard", () => {
  const originalFetch = globalThis.fetch;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          companyId: "co-1",
          companyPrefix: "ACM",
          companyGoalId: "g-1",
          primaryAgentId: "a-1",
          agentIds: ["a-1"],
          projectId: "p-1",
          primaryIssueRef: "ACM-1",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts the full payload to /companies/onboard", async () => {
    const result = await companiesApi.onboard({
      companyName: "Acme",
      companyGoal: "Ship faster\nWithin 90 days",
      llmProvider: "openrouter",
      llmAuthMode: "api_key",
      llmApiKey: "sk-test",
      llmSecretName: "OPENROUTER_API_KEY",
      step2Mode: "manual",
      rosterItems: [],
      agentName: "CEO",
      adapterType: "openrouter_api",
      adapterConfig: {},
      primaryTask: { title: "Welcome", description: "" },
      extraTasks: [],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [path, init] = fetchSpy.mock.calls[0]!;
    expect(path).toBe("/api/companies/onboard");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.companyName).toBe("Acme");
    expect(body.llmSecretName).toBe("OPENROUTER_API_KEY");
    expect(body.step2Mode).toBe("manual");
    expect(result.companyId).toBe("co-1");
    expect(result.primaryIssueRef).toBe("ACM-1");
  });

  it("propagates ApiError from non-2xx responses", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Instance admin required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      companiesApi.onboard({
        companyName: "X",
        companyGoal: "",
        llmProvider: "openrouter",
        llmAuthMode: "api_key",
        llmApiKey: "",
        llmSecretName: "OPENROUTER_API_KEY",
        step2Mode: "manual",
        rosterItems: [],
        agentName: "C",
        adapterType: "openrouter_api",
        adapterConfig: {},
        extraTasks: [],
      }),
    ).rejects.toThrow("Instance admin required");
  });
});
