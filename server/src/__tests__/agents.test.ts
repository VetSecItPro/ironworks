// Priority: HIGH - add tests before production launch
import { describe, it } from "vitest";

describe("agent routes", () => {
  it.todo("should list agents for a company via GET /companies/:id/agents");
  it.todo("should create an agent with valid payload and return API key");
  it.todo("should reject agent creation when company agent limit is reached");
});
