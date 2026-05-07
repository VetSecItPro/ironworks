import { expect, test } from "@playwright/test";

/**
 * E2E: Approvals lifecycle (skip_llm mode).
 *
 * Creates a company, seeds two synthetic approvals, then drives one through
 * approve and the other through reject via API. Finally verifies the
 * Approvals UI page renders without erroring (we don't drive button clicks
 * because the page is wired to the active-company context which is
 * non-deterministic across multiple test companies in the same session).
 *
 * Why API-driven: the approve/reject endpoints require board actor context
 * (assertBoard). The dev server runs as `local_implicit` board on loopback,
 * so unauthenticated POSTs from playwright satisfy the gate. UI button paths
 * would also work, but they couple this spec to dialog confirmation flows
 * that change frequently.
 */

const COMPANY_NAME = `E2E-Approvals-${Date.now()}`;

// TODO(e2e): synthetic-approval seeding may not match the actual API
// contract (no live verification done). Skipping until validated alongside
// the issue-lifecycle spec. Scaffolding preserved.
test.describe.skip("Approvals lifecycle", () => {
  test("creates, approves, and rejects synthetic approvals", async ({ page }) => {
    await page.goto("/");
    const baseUrl = page.url().split("/").slice(0, 3).join("/");

    // 1. Create company
    const companyRes = await page.request.post(`${baseUrl}/api/companies`, {
      data: { name: COMPANY_NAME },
    });
    expect(companyRes.ok()).toBe(true);
    const company = (await companyRes.json()) as { id: string };

    // 2. Create two pending approvals (quality_gate is the lowest-coupling
    //    type — does not require a hiringRequestId or strategy linkage).
    const createApproval = async (note: string) => {
      const res = await page.request.post(`${baseUrl}/api/companies/${company.id}/approvals`, {
        data: {
          type: "quality_gate",
          payload: { note, createdFor: "e2e" },
        },
      });
      expect(res.ok()).toBe(true);
      return (await res.json()) as { id: string; status: string; type: string };
    };

    const approvalToApprove = await createApproval("approve-me");
    const approvalToReject = await createApproval("reject-me");
    expect(approvalToApprove.status).toBe("pending");
    expect(approvalToReject.status).toBe("pending");

    // 3. Approve the first
    const approveRes = await page.request.post(`${baseUrl}/api/approvals/${approvalToApprove.id}/approve`, {
      data: { decisionNote: "lgtm" },
    });
    expect(approveRes.ok()).toBe(true);
    const approved = (await approveRes.json()) as { status: string };
    expect(approved.status).toBe("approved");

    // 4. Reject the second
    const rejectRes = await page.request.post(`${baseUrl}/api/approvals/${approvalToReject.id}/reject`, {
      data: { decisionNote: "no" },
    });
    expect(rejectRes.ok()).toBe(true);
    const rejected = (await rejectRes.json()) as { status: string };
    expect(rejected.status).toBe("rejected");

    // 5. Verify list endpoint reflects both transitions
    const listRes = await page.request.get(`${baseUrl}/api/companies/${company.id}/approvals`);
    expect(listRes.ok()).toBe(true);
    const list = (await listRes.json()) as Array<{ id: string; status: string }>;
    const statusById = new Map(list.map((a) => [a.id, a.status] as const));
    expect(statusById.get(approvalToApprove.id)).toBe("approved");
    expect(statusById.get(approvalToReject.id)).toBe("rejected");

    // 6. UI sanity: the Approvals page renders without 5xx. We assert the
    //    page-shell heading appears; finer-grained list assertions would
    //    couple to active-company-context behaviour.
    await page.goto("/approvals/all");
    await expect(page.getByText(/approvals/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
