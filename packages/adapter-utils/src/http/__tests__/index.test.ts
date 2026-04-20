import { describe, expect, it } from "vitest";
import * as httpModule from "../index.js";

describe("http module barrel", () => {
  it("exports all submodules", () => {
    expect(httpModule).toHaveProperty("transport");
    expect(httpModule).toHaveProperty("sseParser");
    expect(httpModule).toHaveProperty("retry");
    expect(httpModule).toHaveProperty("circuitBreaker");
    expect(httpModule).toHaveProperty("rateLimiter");
    expect(httpModule).toHaveProperty("toolNormalize");
    expect(httpModule).toHaveProperty("cost");
    expect(httpModule).toHaveProperty("redaction");
    expect(httpModule).toHaveProperty("errors");
    expect(httpModule).toHaveProperty("sessionReplay");
    expect(httpModule).toHaveProperty("pricingTable");
  });
});
