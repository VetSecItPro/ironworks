/**
 * k6 load test - smoke test for IronWorks API
 *
 * Run: k6 run tests/load/smoke.js
 * Install: brew install k6 (macOS) or https://k6.io/docs/getting-started/installation/
 *
 * This smoke test verifies the API can handle basic concurrent load.
 * Extend with scenario-specific tests before scaling to paying customers.
 */

import { check, sleep } from "k6";
import http from "k6/http";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3100";

export const options = {
  // Smoke test: low load, verify system works under basic concurrency
  stages: [
    { duration: "30s", target: 10 }, // Ramp up to 10 users
    { duration: "1m", target: 10 }, // Stay at 10 users
    { duration: "30s", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests under 500ms
    http_req_failed: ["rate<0.01"], // Less than 1% failure rate
  },
};

export default function () {
  // Health check
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    "health status 200": (r) => r.status === 200,
    "health body ok": (r) => JSON.parse(r.body).status === "ok",
  });

  sleep(1);
}
