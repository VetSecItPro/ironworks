import type { CompanyPortabilityFileEntry, CompanyPortabilityPreviewResult } from "@ironworksai/shared";
import { getAgentOrderStorageKey, writeAgentOrder } from "../../lib/agent-order";
import { getProjectOrderStorageKey, writeProjectOrder } from "../../lib/project-order";
import { readZipArchive } from "../../lib/zip";

/**
 * Write imported sidebar order to local storage so agent/project ordering
 * is preserved after import.
 */
export function applyImportedSidebarOrder(
  preview: CompanyPortabilityPreviewResult | null,
  result: {
    company: { id: string };
    agents: Array<{ slug: string; id: string | null }>;
    projects: Array<{ slug: string; id: string | null }>;
  },
  userId: string | null | undefined,
) {
  const sidebar = preview?.manifest.sidebar;
  if (!sidebar) return;
  if (!userId?.trim()) return;

  const agentIdBySlug = new Map(
    result.agents
      .filter((agent): agent is { slug: string; id: string } => typeof agent.id === "string" && agent.id.length > 0)
      .map((agent) => [agent.slug, agent.id]),
  );
  const projectIdBySlug = new Map(
    result.projects
      .filter(
        (project): project is { slug: string; id: string } => typeof project.id === "string" && project.id.length > 0,
      )
      .map((project) => [project.slug, project.id]),
  );

  const orderedAgentIds = sidebar.agents
    .map((slug) => agentIdBySlug.get(slug))
    .filter((id): id is string => Boolean(id));
  const orderedProjectIds = sidebar.projects
    .map((slug) => projectIdBySlug.get(slug))
    .filter((id): id is string => Boolean(id));

  if (orderedAgentIds.length > 0) {
    writeAgentOrder(getAgentOrderStorageKey(result.company.id, userId), orderedAgentIds);
  }
  if (orderedProjectIds.length > 0) {
    writeProjectOrder(getProjectOrderStorageKey(result.company.id, userId), orderedProjectIds);
  }
}

/**
 * Read and parse a local zip archive into the shape expected by the import API.
 */
export async function readLocalPackageZip(file: File): Promise<{
  name: string;
  rootPath: string | null;
  files: Record<string, CompanyPortabilityFileEntry>;
}> {
  if (!/\.zip$/i.test(file.name)) {
    throw new Error("Select a .zip company package.");
  }
  const archive = await readZipArchive(await file.arrayBuffer());
  if (Object.keys(archive.files).length === 0) {
    throw new Error("No package files were found in the selected zip archive.");
  }
  return {
    name: file.name,
    rootPath: archive.rootPath,
    files: archive.files,
  };
}
