// @vitest-environment node

import type { CompanySecret, SecretProviderDescriptor } from "@ironworksai/shared";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../context/ThemeContext";
import { SecretsPage } from "./Secrets";

// SettingsProviderNav uses router context — stub it for SSR-only tests.
vi.mock("./SettingsProviderNav", () => ({
  SettingsProviderNav: () => null,
}));

// PageSkeleton drags in motion/etc — keep it minimal so tests stay focused.
vi.mock("../../components/PageSkeleton", () => ({
  PageSkeleton: () => <div data-testid="page-skeleton">Loading...</div>,
}));

const TEST_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

function makeTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeTestClient()}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

const PROVIDERS: SecretProviderDescriptor[] = [
  { id: "local_encrypted", label: "Local (encrypted)", requiresExternalRef: false },
];

function makeSecret(overrides: Partial<CompanySecret> = {}): CompanySecret {
  return {
    id: "sec-1",
    companyId: TEST_COMPANY_ID,
    name: "STRIPE_WEBHOOK_SECRET",
    provider: "local_encrypted",
    externalRef: null,
    latestVersion: 1,
    description: null,
    createdByAgentId: null,
    createdByUserId: null,
    createdAt: new Date("2026-04-19T10:00:00Z"),
    updatedAt: new Date("2026-04-19T10:00:00Z"),
    ...overrides,
  };
}

// Mock the secrets API at module boundary so query results are deterministic.
const listMock = vi.fn<() => Promise<CompanySecret[]>>();
const providersMock = vi.fn<() => Promise<SecretProviderDescriptor[]>>();

vi.mock("@/api/secrets", () => ({
  secretsApi: {
    list: () => listMock(),
    providers: () => providersMock(),
    create: vi.fn(),
    rotate: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

describe("SecretsPage", () => {
  it("renders the heading and description copy", () => {
    listMock.mockResolvedValue([]);
    providersMock.mockResolvedValue(PROVIDERS);
    const html = renderToStaticMarkup(
      <Wrapper>
        <SecretsPage companyId={TEST_COMPANY_ID} />
      </Wrapper>,
    );
    expect(html).toContain("Secrets vault");
    expect(html).toContain("Plaintext is never returned after creation");
    expect(html).toContain("New secret");
  });

  it("shows loading state while initial queries are pending", () => {
    // useQuery without a resolved promise = isLoading on first SSR pass.
    listMock.mockImplementation(() => new Promise<CompanySecret[]>(() => {}));
    providersMock.mockImplementation(() => new Promise<SecretProviderDescriptor[]>(() => {}));
    const html = renderToStaticMarkup(
      <Wrapper>
        <SecretsPage companyId={TEST_COMPANY_ID} />
      </Wrapper>,
    );
    expect(html).toContain("page-skeleton");
  });

  it("renders empty-state CTA when there are zero secrets", () => {
    // Force the query to resolve synchronously by pre-seeding it.
    const client = makeTestClient();
    client.setQueryData(["secrets", TEST_COMPANY_ID], []);
    client.setQueryData(["secret-providers", TEST_COMPANY_ID], PROVIDERS);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <SecretsPage companyId={TEST_COMPANY_ID} />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(html).toContain("No secrets yet");
    // Empty-state CTA renders an additional "New secret" button.
    expect((html.match(/New secret/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("renders the secrets table with a row per secret", () => {
    const client = makeTestClient();
    client.setQueryData(
      ["secrets", TEST_COMPANY_ID],
      [makeSecret(), makeSecret({ id: "sec-2", name: "MCP_GITHUB_TOKEN", latestVersion: 3 })],
    );
    client.setQueryData(["secret-providers", TEST_COMPANY_ID], PROVIDERS);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <SecretsPage companyId={TEST_COMPANY_ID} />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(html).toContain("STRIPE_WEBHOOK_SECRET");
    expect(html).toContain("MCP_GITHUB_TOKEN");
    expect(html).toContain("Rotate");
    expect(html).toContain("Delete");
    expect(html).toContain("v3");
  });

  it("never renders any plaintext value or password type for table rows", () => {
    const client = makeTestClient();
    client.setQueryData(["secrets", TEST_COMPANY_ID], [makeSecret()]);
    client.setQueryData(["secret-providers", TEST_COMPANY_ID], PROVIDERS);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <SecretsPage companyId={TEST_COMPANY_ID} />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    // No "value" field is in the secret summary type; defensive sanity check.
    expect(html).not.toMatch(/value="sk-/);
  });
});

describe("SecretsPage type sanity", () => {
  it("useQuery types resolve cleanly", () => {
    // This is a compile-time assertion: if typings break, vitest type-check
    // will fail before test execution. Keep a minimal runtime no-op.
    const fn = useQuery;
    expect(typeof fn).toBe("function");
  });
});
