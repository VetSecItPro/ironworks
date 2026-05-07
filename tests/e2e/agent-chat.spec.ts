import { expect, test } from "@playwright/test";

/**
 * E2E: Agent chat — human posts a message into a channel.
 *
 * Verifies the post mechanism and feed read-back. We deliberately do NOT
 * assert on agent responses: the channel router (which decides which agents
 * wake up on a human message) is still WIP, and waiting for an agent reply
 * here would either hang the spec or require LLM API keys. This spec proves
 * the message-pipeline: list channels -> post -> readback the same message.
 *
 * UI sanity: navigate to the channel view and assert the message body is
 * rendered. The ChannelView page uses TanStack Query with SSE updates, so we
 * give the assertion a generous timeout.
 */

const COMPANY_NAME = `E2E-Channels-${Date.now()}`;
const MESSAGE_BODY = `Hello from playwright ${Date.now()}`;

// TODO(e2e): channel message-post contract not verified against live API.
// Skipping pending validation alongside the issue-lifecycle + approvals
// specs. Scaffolding preserved.
test.describe.skip("Agent chat — channel post", () => {
  test("posts a human message to #company and reads it back", async ({ page }) => {
    await page.goto("/");
    const baseUrl = page.url().split("/").slice(0, 3).join("/");

    // 1. Create company
    const companyRes = await page.request.post(`${baseUrl}/api/companies`, {
      data: { name: COMPANY_NAME },
    });
    expect(companyRes.ok()).toBe(true);
    const company = (await companyRes.json()) as { id: string };

    // 2. List channels (auto-creates #company on first call)
    const channelsRes = await page.request.get(`${baseUrl}/api/companies/${company.id}/channels`);
    expect(channelsRes.ok()).toBe(true);
    const channels = (await channelsRes.json()) as Array<{ id: string; name: string }>;
    expect(channels.length).toBeGreaterThan(0);

    // Prefer the #company channel; fall back to the first available channel.
    const channel = channels.find((c) => c.name === "company" || c.name === "#company") ?? channels[0]!;

    // 3. Post a human message
    const postRes = await page.request.post(
      `${baseUrl}/api/companies/${company.id}/channels/${channel.id}/messages`,
      { data: { body: MESSAGE_BODY } },
    );
    expect(postRes.status()).toBe(201);
    const posted = (await postRes.json()) as { id: string; body: string };
    expect(posted.body).toBe(MESSAGE_BODY);

    // 4. Read it back from the feed
    const feedRes = await page.request.get(
      `${baseUrl}/api/companies/${company.id}/channels/${channel.id}/messages`,
    );
    expect(feedRes.ok()).toBe(true);
    const messages = (await feedRes.json()) as Array<{ id: string; body: string }>;
    expect(messages.some((m) => m.id === posted.id && m.body === MESSAGE_BODY)).toBe(true);

    // 5. UI sanity: navigate to the channel page and verify the message
    //    renders in the feed. Generous timeout because ChannelView is a
    //    lazy-loaded route with TanStack Query + SSE wiring.
    await page.goto(`/channels/${channel.id}`);
    await expect(page.getByText(MESSAGE_BODY).first()).toBeVisible({ timeout: 20_000 });
  });
});
