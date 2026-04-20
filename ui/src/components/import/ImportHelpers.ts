import type { CompanyPortabilityPreviewResult } from "@ironworksai/shared";

export const ACTION_COLORS: Record<string, string> = {
  create: "text-emerald-500 border-emerald-500/30",
  update: "text-amber-500 border-amber-500/30",
  overwrite: "text-red-500 border-red-500/30",
  replace: "text-red-500 border-red-500/30",
  skip: "text-muted-foreground border-border",
  none: "text-muted-foreground border-border",
};

export function ensureMarkdownPath(p: string): string {
  return p.endsWith(".md") ? p : `${p}.md`;
}

/** Build a map from file path to planned action using the manifest + plan */
export function buildActionMap(preview: CompanyPortabilityPreviewResult): Map<string, string> {
  const map = new Map<string, string>();
  const manifest = preview.manifest;

  for (const ap of preview.plan.agentPlans) {
    const agent = manifest.agents.find((a) => a.slug === ap.slug);
    if (agent) {
      const path = ensureMarkdownPath(agent.path);
      map.set(path, ap.action);
    }
  }

  for (const pp of preview.plan.projectPlans) {
    const project = manifest.projects.find((p) => p.slug === pp.slug);
    if (project) {
      const path = ensureMarkdownPath(project.path);
      map.set(path, pp.action);
    }
  }

  for (const ip of preview.plan.issuePlans) {
    const issue = manifest.issues.find((i) => i.slug === ip.slug);
    if (issue) {
      const path = ensureMarkdownPath(issue.path);
      map.set(path, ip.action);
    }
  }

  for (const skill of manifest.skills) {
    const path = ensureMarkdownPath(skill.path);
    map.set(path, "create");
    for (const file of skill.fileInventory) {
      if (preview.files[file.path]) {
        map.set(file.path, "create");
      }
    }
  }

  if (manifest.company) {
    const path = ensureMarkdownPath(manifest.company.path);
    map.set(path, preview.plan.companyAction === "none" ? "skip" : preview.plan.companyAction);
  }

  return map;
}

export interface ConflictItem {
  slug: string;
  kind: "agent" | "project" | "issue" | "skill";
  originalName: string;
  plannedName: string;
  filePath: string | null;
  action: "rename" | "update";
}

export function buildConflictList(preview: CompanyPortabilityPreviewResult): ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  const manifest = preview.manifest;

  for (const ap of preview.plan.agentPlans) {
    if (ap.existingAgentId) {
      const agent = manifest.agents.find((a) => a.slug === ap.slug);
      conflicts.push({
        slug: ap.slug,
        kind: "agent",
        originalName: agent?.name ?? ap.slug,
        plannedName: ap.plannedName,
        filePath: agent ? ensureMarkdownPath(agent.path) : null,
        action: ap.action === "update" ? "update" : "rename",
      });
    }
  }

  for (const pp of preview.plan.projectPlans) {
    if (pp.existingProjectId) {
      const project = manifest.projects.find((p) => p.slug === pp.slug);
      conflicts.push({
        slug: pp.slug,
        kind: "project",
        originalName: project?.name ?? pp.slug,
        plannedName: pp.plannedName,
        filePath: project ? ensureMarkdownPath(project.path) : null,
        action: pp.action === "update" ? "update" : "rename",
      });
    }
  }

  return conflicts;
}

/** Extract a prefix from the import source URL or uploaded zip package name */
export function deriveSourcePrefix(
  sourceMode: string,
  importUrl: string,
  localPackageName: string | null,
  localRootPath: string | null,
): string | null {
  if (sourceMode === "local") {
    if (localRootPath) return localRootPath.split("/").pop() ?? null;
    if (!localPackageName) return null;
    return localPackageName.replace(/\.zip$/i, "") || null;
  }
  if (sourceMode === "github") {
    const url = importUrl.trim();
    if (!url) return null;
    try {
      const pathname = new URL(url.startsWith("http") ? url : `https://${url}`).pathname;
      const segments = pathname.split("/").filter(Boolean);
      return segments.length > 0 ? segments[segments.length - 1] : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Generate a prefix-based rename: e.g. "gstack" + "CEO" - "gstack-CEO" */
export function prefixedName(prefix: string | null, originalName: string): string {
  if (!prefix) return originalName;
  return `${prefix}-${originalName}`;
}
