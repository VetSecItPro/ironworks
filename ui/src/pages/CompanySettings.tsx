import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsSidebarNav, useCompanySettingsState } from "../components/company-settings";
import { InviteUserDialog } from "../components/InviteUserDialog";
import { MessagingSetup } from "../components/MessagingSetup";
import { AgentsRosterSection } from "../components/settings/AgentsRosterSection";
import { ApiKeysSection } from "../components/settings/ApiKeysSection";
import { AppearanceSection } from "../components/settings/AppearanceSection";
import { AuditTrailSection } from "../components/settings/AuditTrailSection";
import { AutonomySection } from "../components/settings/AutonomySection";
import { BrandingSection } from "../components/settings/BrandingSection";
import { CompanyPackagesSection } from "../components/settings/CompanyPackagesSection";
import { CostAlertsSection } from "../components/settings/CostAlertsSection";
import { DangerZoneSection } from "../components/settings/DangerZoneSection";
import { DataExportSection } from "../components/settings/DataExportSection";
import { DataPrivacySection } from "../components/settings/DataPrivacySection";
import { DepartmentTemplatesSection } from "../components/settings/DepartmentTemplatesSection";
import { GeneralSection } from "../components/settings/GeneralSection";
import { HiringSection } from "../components/settings/HiringSection";
import { IntegrationHubSection } from "../components/settings/IntegrationHubSection";
import { InvitesSection } from "../components/settings/InvitesSection";
import { McpServersSection } from "../components/settings/McpServersSection";
import { ModelRoutingSection } from "../components/settings/ModelRoutingSection";
import { RiskThresholdsSection } from "../components/settings/RiskThresholdsSection";
import { SecuritySection } from "../components/settings/SecuritySection";
// Section components
import { SettingsErrorBoundary } from "../components/settings/SettingsErrorBoundary";
import { TalentPoolSection } from "../components/settings/TalentPoolSection";
import { TeamMembersSection } from "../components/settings/TeamMembersSection";
import { WebhooksSettings } from "../components/WebhooksSettings";

const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "branding", label: "Branding" },
  { id: "agents-roster", label: "Agents" },
  { id: "hiring", label: "Hiring" },
  { id: "invites", label: "Invites" },
  { id: "messaging", label: "Messaging" },
  { id: "security", label: "Security" },
  { id: "api-keys", label: "API Keys" },
  { id: "autonomy", label: "Autonomy" },
  { id: "model-routing", label: "Model Routing" },
  { id: "cost-alerts", label: "Cost Alerts" },
  { id: "webhooks", label: "Webhooks" },
  { id: "mcp-servers", label: "MCP Servers" },
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
  const state = useCompanySettingsState();
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

  if (!state.selectedCompany || !state.selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  return (
    <div className="flex gap-8 max-w-4xl">
      <SettingsSidebarNav sections={SETTINGS_SECTIONS} activeSection={activeSection} />

      <div className="flex-1 min-w-0 max-w-2xl space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Company Settings</h1>
        </div>

        <GeneralSection
          selectedCompany={state.selectedCompany}
          companyName={state.companyName}
          setCompanyName={state.setCompanyName}
          description={state.description}
          setDescription={state.setDescription}
          brandColor={state.brandColor}
          generalDirty={state.generalDirty}
          onSave={state.handleSaveGeneral}
          isSaving={state.generalMutation.isPending}
          isSuccess={state.generalMutation.isSuccess}
          saveError={state.generalMutation.isError ? (state.generalMutation.error as Error) : null}
        />

        <AppearanceSection
          selectedCompany={state.selectedCompany}
          companyName={state.companyName}
          brandColor={state.brandColor}
          setBrandColor={state.setBrandColor}
          logoUrl={state.logoUrl}
          logoUploadError={state.logoUploadError}
          isUploadPending={state.logoUploadMutation.isPending}
          isUploadError={state.logoUploadMutation.isError}
          uploadError={state.logoUploadMutation.isError ? (state.logoUploadMutation.error as Error) : null}
          isClearPending={state.clearLogoMutation.isPending}
          isClearError={state.clearLogoMutation.isError}
          clearError={state.clearLogoMutation.isError ? (state.clearLogoMutation.error as Error) : null}
          onLogoFileChange={state.handleLogoFileChange}
          onClearLogo={state.handleClearLogo}
        />

        <BrandingSection
          accentColor={state.accentColor}
          setAccentColor={state.setAccentColor}
          customFavicon={state.customFavicon}
          setCustomFavicon={state.setCustomFavicon}
          removeIronWorksBranding={state.removeIronWorksBranding}
          setRemoveIronWorksBranding={state.setRemoveIronWorksBranding}
        />

        <AgentsRosterSection companyId={state.selectedCompanyId} />

        <HiringSection
          selectedCompany={state.selectedCompany}
          onToggleApproval={(v) => state.settingsMutation.mutate(v)}
        />

        <InvitesSection
          isGenerating={state.inviteMutation.isPending}
          inviteError={state.inviteError}
          inviteSnippet={state.inviteSnippet}
          snippetCopied={state.snippetCopied}
          snippetCopyDelightId={state.snippetCopyDelightId}
          onGenerate={() => state.inviteMutation.mutate()}
          onCopySnippet={state.handleCopySnippet}
        />

        <div id="messaging" className="scroll-mt-6">
          <MessagingSetup companyId={state.selectedCompanyId} />
        </div>

        <SecuritySection companyId={state.selectedCompanyId} />
        <CompanyPackagesSection />

        <DangerZoneSection
          selectedCompany={state.selectedCompany}
          onArchive={state.handleArchive}
          isArchiving={state.archiveMutation.isPending}
          archiveError={state.archiveMutation.isError ? (state.archiveMutation.error as Error) : null}
        />

        {state.canManageMembers && (
          <TeamMembersSection
            members={state.membersQuery.data ?? []}
            onInvite={() => state.setInviteDialogOpen(true)}
          />
        )}

        <ApiKeysSection configuredKeys={state.configuredKeys} />
        <DataExportSection isLoading={state.exportLoading} onExport={state.handleDataExport} />
        <CostAlertsSection companyId={state.selectedCompanyId} />

        <div id="webhooks" className="space-y-4 scroll-mt-6">
          <WebhooksSettings />
        </div>

        <McpServersSection companyId={state.selectedCompanyId} />

        <IntegrationHubSection />
        <AuditTrailSection />
        <DataPrivacySection selectedCompany={state.selectedCompany} selectedCompanyId={state.selectedCompanyId} />
        <AutonomySection defaultAutonomy={state.defaultAutonomy} onAutonomyChange={state.handleAutonomyChange} />

        <div id="model-routing" className="scroll-mt-6">
          <ModelRoutingSection companyId={state.selectedCompanyId} />
        </div>

        <DepartmentTemplatesSection companyId={state.selectedCompanyId} />
        <RiskThresholdsSection companyId={state.selectedCompanyId} />
        <TalentPoolSection companyId={state.selectedCompanyId} />

        <InviteUserDialog open={state.inviteDialogOpen} onOpenChange={state.setInviteDialogOpen} />
      </div>
    </div>
  );
}
