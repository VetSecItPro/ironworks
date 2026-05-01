import type { AutonomyLevel, CompanySecret, MembershipRole } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, useEffect, useState } from "react";
import { accessApi } from "../../api/access";
import { assetsApi } from "../../api/assets";
import { companiesApi } from "../../api/companies";
import { secretsApi } from "../../api/secrets";
import { userInvitesApi } from "../../api/userInvites";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { useCompany } from "../../context/CompanyContext";
import { useToast } from "../../context/ToastContext";
import { useMeAccess } from "../../hooks/useMeAccess";
import { queryKeys } from "../../lib/queryKeys";
import { buildAgentSnippet } from "../settings/agentSnippetUtils";

export function useCompanySettingsState() {
  const { companies, selectedCompany, selectedCompanyId, setSelectedCompanyId } = useCompany();
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
  const brandingStorageKey = selectedCompanyId ? `ironworks:branding:${selectedCompanyId}` : null;
  const [accentColor, setAccentColor] = useState(() => {
    if (!brandingStorageKey) return "";
    return localStorage.getItem(`${brandingStorageKey}:accent`) ?? "";
  });
  const [customFavicon, setCustomFavicon] = useState(() => {
    if (!brandingStorageKey) return "";
    return localStorage.getItem(`${brandingStorageKey}:favicon`) ?? "";
  });
  const [removeIronWorksBranding, setRemoveIronWorksBranding] = useState(() => {
    if (!brandingStorageKey) return false;
    return localStorage.getItem(`${brandingStorageKey}:removeBranding`) === "true";
  });

  // Persist branding settings
  useEffect(() => {
    if (!brandingStorageKey) return;
    if (accentColor) localStorage.setItem(`${brandingStorageKey}:accent`, accentColor);
    else localStorage.removeItem(`${brandingStorageKey}:accent`);
    if (customFavicon) localStorage.setItem(`${brandingStorageKey}:favicon`, customFavicon);
    else localStorage.removeItem(`${brandingStorageKey}:favicon`);
    localStorage.setItem(`${brandingStorageKey}:removeBranding`, String(removeIronWorksBranding));
  }, [brandingStorageKey, accentColor, customFavicon, removeIronWorksBranding]);

  // Apply custom favicon when set
  useEffect(() => {
    if (!customFavicon) return;
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
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
    setRemoveIronWorksBranding(localStorage.getItem(`${bKey}:removeBranding`) === "true");
  }, [selectedCompany]);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // Default autonomy level - persisted per-company in localStorage
  const autonomyStorageKey = selectedCompanyId ? `ironworks:autonomy:${selectedCompanyId}` : null;
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
  const myRole = selectedCompanyId ? getRoleForCompany(selectedCompanyId) : ("member" as MembershipRole);
  const canManageMembers = myRole === "owner" || myRole === "admin" || isInstanceAdmin;

  const membersQuery = useQuery({
    queryKey: ["access", "members", selectedCompanyId],
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId && canManageMembers,
  });

  const userInvitesQuery = useQuery({
    queryKey: ["user-invites", selectedCompanyId],
    queryFn: () => userInvitesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && canManageMembers,
  });

  const revokeUserInviteMutation = useMutation({
    mutationFn: (inviteId: string) => userInvitesApi.revoke(selectedCompanyId!, inviteId),
    onSuccess: () => {
      pushToast({ title: "Invite revoked", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["user-invites", selectedCompanyId] });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? `Failed to revoke: ${err.message}` : "Failed to revoke invite",
        tone: "error",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => accessApi.removeMember(selectedCompanyId!, memberId),
    onSuccess: () => {
      pushToast({ title: "Member removed", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["access", "members", selectedCompanyId] });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? `Failed to remove: ${err.message}` : "Failed to remove member",
        tone: "error",
      });
    },
  });

  const secretsQuery = useQuery({
    queryKey: queryKeys.secrets.list(selectedCompanyId ?? ""),
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const configuredKeys = new Set(
    (secretsQuery.data ?? [])
      .filter((s: CompanySecret) => s.name === "ANTHROPIC_API_KEY" || s.name === "OPENAI_API_KEY")
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
    mutationFn: (data: { name: string; description: string | null; brandColor: string | null }) =>
      companiesApi.update(selectedCompanyId!, data),
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
        invite.onboardingTextUrl ?? invite.onboardingTextPath ?? `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http") ? onboardingTextLink : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl: manifest.onboarding.connectivity?.testResolutionEndpoint?.url ?? null,
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
      setInviteError(err instanceof Error ? err.message : "Failed to create invite");
    },
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi.uploadCompanyLogo(selectedCompanyId!, file).then((asset) =>
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
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
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
      const { privacyApi } = await import("../../api/privacy");
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
    mutationFn: ({ companyId, nextCompanyId }: { companyId: string; nextCompanyId: string | null }) =>
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

  const deleteMutation = useMutation({
    mutationFn: ({ companyId, nextCompanyId }: { companyId: string; nextCompanyId: string | null }) =>
      companiesApi.remove(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      pushToast({ title: "Company permanently deleted", tone: "success" });
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? `Delete failed: ${err.message}` : "Failed to delete company",
        tone: "error",
      });
    },
  });

  useEffect(() => {
    setBreadcrumbs([{ label: selectedCompany?.name ?? "Company", href: "/dashboard" }, { label: "Settings" }]);
  }, [setBreadcrumbs, selectedCompany?.name]);

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
      `Archive company "${selectedCompany.name}"?\n\nIt will be hidden from the sidebar but ALL data is kept (agents, history, secrets, knowledge base). Reversible by an instance admin.\n\nTip: even though archive is reversible, consider exporting your data first as a backup. Cancel and use Settings → Data Export.`,
    );
    if (!confirmed) return;
    const nextCompanyId =
      companies.find((company) => company.id !== selectedCompanyId && company.status !== "archived")?.id ?? null;
    archiveMutation.mutate({ companyId: selectedCompanyId, nextCompanyId });
  }

  function handleDelete() {
    if (!selectedCompanyId || !selectedCompany) return;
    const typed = window.prompt(
      `⚠️ PERMANENTLY DELETE "${selectedCompany.name}"?\n\nThis wipes ALL data: agents, heartbeats, channels, knowledge, secrets, issues, library files. CANNOT be undone.\n\nSTRONGLY RECOMMENDED: cancel and export your data first via Settings → Data Export. There is no recovery after this point.\n\nIf you have already exported, type the company name to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim() !== selectedCompany.name) {
      pushToast({ title: "Name did not match. Delete cancelled.", tone: "error" });
      return;
    }
    const nextCompanyId =
      companies.find((company) => company.id !== selectedCompanyId && company.status !== "archived")?.id ?? null;
    deleteMutation.mutate({ companyId: selectedCompanyId, nextCompanyId });
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

  return {
    selectedCompany,
    selectedCompanyId,
    companyName,
    setCompanyName,
    description,
    setDescription,
    brandColor,
    setBrandColor,
    logoUrl,
    logoUploadError,
    accentColor,
    setAccentColor,
    customFavicon,
    setCustomFavicon,
    removeIronWorksBranding,
    setRemoveIronWorksBranding,
    inviteDialogOpen,
    setInviteDialogOpen,
    defaultAutonomy,
    handleAutonomyChange,
    canManageMembers,
    membersQuery,
    userInvitesQuery,
    revokeUserInviteMutation,
    removeMemberMutation,
    configuredKeys,
    inviteError,
    inviteSnippet,
    snippetCopied,
    snippetCopyDelightId,
    generalDirty,
    generalMutation,
    settingsMutation,
    inviteMutation,
    logoUploadMutation,
    clearLogoMutation,
    handleLogoFileChange,
    handleClearLogo,
    exportLoading,
    handleDataExport,
    archiveMutation,
    deleteMutation,
    handleDelete,
    handleSaveGeneral,
    handleArchive,
    handleCopySnippet,
  };
}
