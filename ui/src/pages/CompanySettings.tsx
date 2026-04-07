import { ChangeEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { companiesApi } from "../api/companies";
import { accessApi } from "../api/access";
import { assetsApi } from "../api/assets";
import { secretsApi } from "../api/secrets";
import { queryKeys } from "../lib/queryKeys";
import { useMeAccess } from "../hooks/useMeAccess";
import { Settings } from "lucide-react";
import { MessagingSetup } from "../components/MessagingSetup";
import { WebhooksSettings } from "../components/WebhooksSettings";
import { InviteUserDialog } from "../components/InviteUserDialog";
import type { MembershipRole, CompanySecret } from "@ironworksai/shared";
import { AUTONOMY_LEVELS, type AutonomyLevel } from "@ironworksai/shared";

// Section components
import { SettingsErrorBoundary } from "../components/settings/SettingsErrorBoundary";
import { GeneralSection } from "../components/settings/GeneralSection";
import { AppearanceSection } from "../components/settings/AppearanceSection";
import { BrandingSection } from "../components/settings/BrandingSection";
import { HiringSection } from "../components/settings/HiringSection";
import { InvitesSection } from "../components/settings/InvitesSection";
import { ApiKeysSection } from "../components/settings/ApiKeysSection";
import { SecuritySection } from "../components/settings/SecuritySection";
import { ModelRoutingSection } from "../components/settings/ModelRoutingSection";
import { CostAlertsSection } from "../components/settings/CostAlertsSection";
import { AuditTrailSection } from "../components/settings/AuditTrailSection";
import { IntegrationHubSection } from "../components/settings/IntegrationHubSection";
import { DataPrivacySection } from "../components/settings/DataPrivacySection";
import { DataExportSection } from "../components/settings/DataExportSection";
import { DangerZoneSection } from "../components/settings/DangerZoneSection";
import { TeamMembersSection } from "../components/settings/TeamMembersSection";
import { AutonomySection } from "../components/settings/AutonomySection";
import { CompanyPackagesSection } from "../components/settings/CompanyPackagesSection";
import { DepartmentTemplatesSection } from "../components/settings/DepartmentTemplatesSection";
import { RiskThresholdsSection } from "../components/settings/RiskThresholdsSection";
import { TalentPoolSection } from "../components/settings/TalentPoolSection";
import { buildAgentSnippet } from "../components/settings/agentSnippetUtils";

const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "branding", label: "Branding" },
  { id: "hiring", label: "Hiring" },
  { id: "invites", label: "Invites" },
  { id: "messaging", label: "Messaging" },
  { id: "security", label: "Security" },
  { id: "api-keys", label: "API Keys" },
  { id: "autonomy", label: "Autonomy" },
  { id: "model-routing", label: "Model Routing" },
  { id: "cost-alerts", label: "Cost Alerts" },
  { id: "webhooks", label: "Webhooks" },
  { id: "integrations", label: "Integrations" },
  { id: "audit-trail", label: "Audit Trail" },
  { id: "data-privacy", label: "Data & Privacy" },
  { id: "danger-zone", label: "Danger Zone" },
];

export function CompanySettings() {
  return (
    <SettingsErrorBoundary>
      <CompanySettingsInner />
    </SettingsErrorBoundary>
  );
}

function CompanySettingsInner() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId,
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  // Branding state (stored in localStorage per company)
  const brandingStorageKey = selectedCompanyId
    ? `ironworks:branding:${selectedCompanyId}`
    : null;
  const [accentColor, setAccentColor] = useState(() => {
    if (!brandingStorageKey) return "";
    return localStorage.getItem(`${brandingStorageKey}:accent`) ?? "";
  });
  const [customFavicon, setCustomFavicon] = useState(() => {
    if (!brandingStorageKey) return "";
    return localStorage.getItem(`${brandingStorageKey}:favicon`) ?? "";
  });
  const [removeIronWorksBranding, setRemoveIronWorksBranding] = useState(
    () => {
      if (!brandingStorageKey) return false;
      return (
        localStorage.getItem(`${brandingStorageKey}:removeBranding`) === "true"
      );
    },
  );

  // Persist branding settings
  useEffect(() => {
    if (!brandingStorageKey) return;
    if (accentColor)
      localStorage.setItem(`${brandingStorageKey}:accent`, accentColor);
    else localStorage.removeItem(`${brandingStorageKey}:accent`);
    if (customFavicon)
      localStorage.setItem(`${brandingStorageKey}:favicon`, customFavicon);
    else localStorage.removeItem(`${brandingStorageKey}:favicon`);
    localStorage.setItem(
      `${brandingStorageKey}:removeBranding`,
      String(removeIronWorksBranding),
    );
  }, [brandingStorageKey, accentColor, customFavicon, removeIronWorksBranding]);

  // Apply custom favicon when set
  useEffect(() => {
    if (!customFavicon) return;
    const link = document.querySelector(
      "link[rel~='icon']",
    ) as HTMLLinkElement | null;
    if (link) {
      link.href = customFavicon;
    }
  }, [customFavicon]);

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setLogoUrl(selectedCompany.logoUrl ?? "");
    const bKey = `ironworks:branding:${selectedCompany.id}`;
    setAccentColor(localStorage.getItem(`${bKey}:accent`) ?? "");
    setCustomFavicon(localStorage.getItem(`${bKey}:favicon`) ?? "");
    setRemoveIronWorksBranding(
      localStorage.getItem(`${bKey}:removeBranding`) === "true",
    );
  }, [selectedCompany]);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // Default autonomy level - persisted per-company in localStorage
  const autonomyStorageKey = selectedCompanyId
    ? `ironworks:autonomy:${selectedCompanyId}`
    : null;
  const [defaultAutonomy, setDefaultAutonomy] = useState<AutonomyLevel>(() => {
    if (!autonomyStorageKey) return "h3";
    return (localStorage.getItem(autonomyStorageKey) as AutonomyLevel) ?? "h3";
  });

  function handleAutonomyChange(level: AutonomyLevel) {
    setDefaultAutonomy(level);
    if (autonomyStorageKey) localStorage.setItem(autonomyStorageKey, level);
    pushToast({ title: "Default autonomy level updated", tone: "success" });
  }

  const { isInstanceAdmin, getRoleForCompany } = useMeAccess();
  const myRole = selectedCompanyId
    ? getRoleForCompany(selectedCompanyId)
    : ("member" as MembershipRole);
  const canManageMembers =
    myRole === "owner" || myRole === "admin" || isInstanceAdmin;

  const membersQuery = useQuery({
    queryKey: ["access", "members", selectedCompanyId],
    queryFn: () => accessApi.listJoinRequests(selectedCompanyId!, "approved"),
    enabled: !!selectedCompanyId && canManageMembers,
  });

  const secretsQuery = useQuery({
    queryKey: queryKeys.secrets.list(selectedCompanyId ?? ""),
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const configuredKeys = new Set(
    (secretsQuery.data ?? [])
      .filter(
        (s: CompanySecret) =>
          s.name === "ANTHROPIC_API_KEY" || s.name === "OPENAI_API_KEY",
      )
      .map((s: CompanySecret) => s.name),
  );

  // Invite snippet state
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSnippet, setInviteSnippet] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyDelightId, setSnippetCopyDelightId] = useState(0);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? ""));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => accessApi.createOpenClawInvitePrompt(selectedCompanyId!),
    onSuccess: async (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const onboardingTextLink =
        invite.onboardingTextUrl ??
        invite.onboardingTextPath ??
        `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http")
        ? onboardingTextLink
        : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates:
            manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl:
            manifest.onboarding.connectivity?.testResolutionEndpoint?.url ??
            null,
        });
      } catch {
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: null,
          testResolutionUrl: null,
        });
      }
      setInviteSnippet(snippet);
      try {
        await navigator.clipboard.writeText(snippet);
        setSnippetCopied(true);
        setSnippetCopyDelightId((prev) => prev + 1);
        setTimeout(() => setSnippetCopied(false), 2000);
      } catch {
        /* clipboard may not be available */
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(selectedCompanyId!),
      });
    },
    onError: (err) => {
      setInviteError(
        err instanceof Error ? err.message : "Failed to create invite",
      );
    },
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) =>
          companiesApi.update(selectedCompanyId!, {
            logoAssetId: asset.assetId,
          }),
        ),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    },
  });

  const clearLogoMutation = useMutation({
    mutationFn: () =>
      companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    },
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  useEffect(() => {
    setInviteError(null);
    setInviteSnippet(null);
    setSnippetCopied(false);
    setSnippetCopyDelightId(0);
  }, [selectedCompanyId]);

  // Data export state
  const [exportLoading, setExportLoading] = useState(false);

  async function handleDataExport() {
    if (!selectedCompanyId) return;
    setExportLoading(true);
    try {
      const { privacyApi } = await import("../api/privacy");
      const url = privacyApi.exportData(selectedCompanyId);
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setExportLoading(false);
    }
  }

  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId,
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) =>
      companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats,
      });
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany || !selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null,
    });
  }

  function handleArchive() {
    if (!selectedCompanyId || !selectedCompany) return;
    const confirmed = window.confirm(
      `Archive company "${selectedCompany.name}"? It will be hidden from the sidebar.`,
    );
    if (!confirmed) return;
    const nextCompanyId =
      companies.find(
        (company) =>
          company.id !== selectedCompanyId && company.status !== "archived",
      )?.id ?? null;
    archiveMutation.mutate({ companyId: selectedCompanyId, nextCompanyId });
  }

  async function handleCopySnippet() {
    if (!inviteSnippet) return;
    try {
      await navigator.clipboard.writeText(inviteSnippet);
      setSnippetCopied(true);
      setSnippetCopyDelightId((prev) => prev + 1);
      setTimeout(() => setSnippetCopied(false), 2000);
    } catch {
      /* clipboard may not be available */
    }
  }

  const [activeSection, setActiveSection] = useState("general");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    for (const section of SETTINGS_SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex gap-8 max-w-4xl">
      {/* Sticky sidebar navigation */}
      <nav className="hidden lg:block w-44 shrink-0 sticky top-4 self-start space-y-0.5 pt-10">
        {SETTINGS_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById(s.id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`block px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeSection === s.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="flex-1 min-w-0 max-w-2xl space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Company Settings</h1>
        </div>

        <GeneralSection
          selectedCompany={selectedCompany}
          companyName={companyName}
          setCompanyName={setCompanyName}
          description={description}
          setDescription={setDescription}
          brandColor={brandColor}
          generalDirty={generalDirty}
          onSave={handleSaveGeneral}
          isSaving={generalMutation.isPending}
          isSuccess={generalMutation.isSuccess}
          saveError={
            generalMutation.isError ? (generalMutation.error as Error) : null
          }
        />

        <AppearanceSection
          selectedCompany={selectedCompany}
          companyName={companyName}
          brandColor={brandColor}
          setBrandColor={setBrandColor}
          logoUrl={logoUrl}
          logoUploadError={logoUploadError}
          isUploadPending={logoUploadMutation.isPending}
          isUploadError={logoUploadMutation.isError}
          uploadError={
            logoUploadMutation.isError
              ? (logoUploadMutation.error as Error)
              : null
          }
          isClearPending={clearLogoMutation.isPending}
          isClearError={clearLogoMutation.isError}
          clearError={
            clearLogoMutation.isError
              ? (clearLogoMutation.error as Error)
              : null
          }
          onLogoFileChange={handleLogoFileChange}
          onClearLogo={handleClearLogo}
        />

        <BrandingSection
          accentColor={accentColor}
          setAccentColor={setAccentColor}
          customFavicon={customFavicon}
          setCustomFavicon={setCustomFavicon}
          removeIronWorksBranding={removeIronWorksBranding}
          setRemoveIronWorksBranding={setRemoveIronWorksBranding}
        />

        <HiringSection
          selectedCompany={selectedCompany}
          onToggleApproval={(v) => settingsMutation.mutate(v)}
        />

        <InvitesSection
          isGenerating={inviteMutation.isPending}
          inviteError={inviteError}
          inviteSnippet={inviteSnippet}
          snippetCopied={snippetCopied}
          snippetCopyDelightId={snippetCopyDelightId}
          onGenerate={() => inviteMutation.mutate()}
          onCopySnippet={handleCopySnippet}
        />

        {/* Messaging Bridges */}
        <div id="messaging" className="scroll-mt-6">
          <MessagingSetup companyId={selectedCompanyId} />
        </div>

        {/* Security & Trust */}
        <SecuritySection companyId={selectedCompanyId} />

        <CompanyPackagesSection />

        <DangerZoneSection
          selectedCompany={selectedCompany}
          onArchive={handleArchive}
          isArchiving={archiveMutation.isPending}
          archiveError={
            archiveMutation.isError ? (archiveMutation.error as Error) : null
          }
        />

        {/* Team & Invites */}
        {canManageMembers && (
          <TeamMembersSection
            members={membersQuery.data ?? []}
            onInvite={() => setInviteDialogOpen(true)}
          />
        )}

        <ApiKeysSection configuredKeys={configuredKeys} />

        <DataExportSection
          isLoading={exportLoading}
          onExport={handleDataExport}
        />

        {/* Cost Alerts */}
        <CostAlertsSection companyId={selectedCompanyId} />

        {/* Webhooks */}
        <div id="webhooks" className="space-y-4 scroll-mt-6">
          <WebhooksSettings />
        </div>

        <IntegrationHubSection />

        <AuditTrailSection />

        <DataPrivacySection
          selectedCompany={selectedCompany}
          selectedCompanyId={selectedCompanyId}
        />

        <AutonomySection
          defaultAutonomy={defaultAutonomy}
          onAutonomyChange={handleAutonomyChange}
        />

        {/* Model Routing */}
        <div id="model-routing" className="scroll-mt-6">
          <ModelRoutingSection companyId={selectedCompanyId} />
        </div>

        <DepartmentTemplatesSection companyId={selectedCompanyId} />

        <RiskThresholdsSection companyId={selectedCompanyId} />

        <TalentPoolSection companyId={selectedCompanyId} />

        <InviteUserDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
        />
      </div>
    </div>
  );
}
