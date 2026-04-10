// Priority: HIGH - add tests before production launch
import { describe, it } from "vitest";

describe("billing routes", () => {
  it.todo("should return subscription and usage for GET /companies/:id/billing/subscription");
  it.todo("should reject invalid planTier in POST /companies/:id/billing/checkout");
  it.todo("should enforce company access authorization on billing endpoints");
});
