import path from "node:path";
import { readIronworksSkillSyncPreference } from "@ironworksai/adapter-utils/server-utils";
import type {
  CompanyPortabilityExport,
  CompanyPortabilityExportPreviewResult,
  CompanyPortabilityExportResult,
  CompanyPortabilityFileEntry,
  CompanyPortabilityManifest,
  CompanyPortabilityPreview,
} from "@ironworksai/shared";
import { deriveProjectUrlKey, normalizeAgentUrlKey } from "@ironworksai/shared";
import { notFound, unprocessable } from "../errors.js";
import { renderOrgChartPng } from "../routes/org-chart-svg.js";
import { generateReadme } from "./company-export-readme.js";
import {
  ADAPTER_DEFAULT_RULES_BY_TYPE,
  asString,
  bufferToPortableBinaryFile,
  buildEnvInputMap,
  buildManifestFromPackageFiles,
  buildMarkdown,
  buildOrgTreeFromManifest,
  buildPortableProjectWorkspaces,
  buildReferencedSkillMarkdown,
  buildSkillExportDirMap,
  buildYamlFile,
  COMPANY_LOGO_FILE_NAME,
  type CompanyPortabilityServiceDeps,
  classifyPortableFileKind,
  dedupeEnvInputs,
  exportPortableProjectExecutionWorkspacePolicy,
  extractPortableEnvInputs,
  fetchBinary,
  fetchJson,
  fetchOptionalText,
  fetchText,
  filterExportFiles,
  inferContentTypeFromPath,
  isAbsoluteCommand,
  isPlainRecord,
  normalizeFileMap,
  normalizeInclude,
  normalizePortableConfig,
  normalizePortablePath,
  normalizePortableSidebarOrder,
  normalizeSkillKey,
  normalizeSkillSlug,
  parseFrontmatterMarkdown,
  parseGitHubSourceUrl,
  pruneDefaultLikeValue,
  type ResolvedSource,
  type RoutineLike,
  RUNTIME_DEFAULT_RULES,
  readIncludeEntries,
  resolveCompanyLogoExtension,
  resolveRawGitHubUrl,
  shouldReferenceSkillOnExport,
  sortAgentsBySidebarOrder,
  streamToBuffer,
  stripEmptyValues,
  toSafeSlug,
  uniqueSlug,
  withSkillSourceMetadata,
} from "./company-portability-shared.js";
import { routineService } from "./routines.js";

export async function resolveSource(
  _deps: CompanyPortabilityServiceDeps,
  source: CompanyPortabilityPreview["source"],
): Promise<ResolvedSource> {
  if (source.type === "inline") {
    return buildManifestFromPackageFiles(normalizeFileMap(source.files, source.rootPath));
  }

  const parsed = parseGitHubSourceUrl(source.url);
  let ref = parsed.ref;
  const warnings: string[] = [];
  const companyRelativePath =
    parsed.companyPath === "COMPANY.md"
      ? [parsed.basePath, "COMPANY.md"].filter(Boolean).join("/")
      : parsed.companyPath;
  let companyMarkdown: string | null = null;
  try {
    companyMarkdown = await fetchOptionalText(resolveRawGitHubUrl(parsed.owner, parsed.repo, ref, companyRelativePath));
  } catch (err) {
    if (ref === "main") {
      ref = "master";
      warnings.push("GitHub ref main not found; falling back to master.");
      companyMarkdown = await fetchOptionalText(
        resolveRawGitHubUrl(parsed.owner, parsed.repo, ref, companyRelativePath),
      );
    } else {
      throw err;
    }
  }
  if (!companyMarkdown) {
    throw unprocessable("GitHub company package is missing COMPANY.md");
  }

  const companyPath =
    parsed.companyPath === "COMPANY.md"
      ? "COMPANY.md"
      : normalizePortablePath(path.posix.relative(parsed.basePath || ".", parsed.companyPath));
  const files: Record<string, CompanyPortabilityFileEntry> = {
    [companyPath]: companyMarkdown,
  };
  const tree = await fetchJson<{ tree?: Array<{ path: string; type: string }> }>(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${ref}?recursive=1`,
  ).catch(() => ({ tree: [] }));
  const basePrefix = parsed.basePath ? `${parsed.basePath.replace(/^\/+|\/+$/g, "")}/` : "";
  const candidatePaths = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
    .filter((entry): entry is string => typeof entry === "string")
    .filter((entry) => {
      if (basePrefix && !entry.startsWith(basePrefix)) return false;
      const relative = basePrefix ? entry.slice(basePrefix.length) : entry;
      return (
        relative.endsWith(".md") ||
        relative.startsWith("skills/") ||
        relative === ".ironworks.yaml" ||
        relative === ".ironworks.yml"
      );
    });
  for (const repoPath of candidatePaths) {
    const relativePath = basePrefix ? repoPath.slice(basePrefix.length) : repoPath;
    if (files[relativePath] !== undefined) continue;
    files[normalizePortablePath(relativePath)] = await fetchText(
      resolveRawGitHubUrl(parsed.owner, parsed.repo, ref, repoPath),
    );
  }
  const companyDoc = parseFrontmatterMarkdown(companyMarkdown);
  const includeEntries = readIncludeEntries(companyDoc.frontmatter);
  for (const includeEntry of includeEntries) {
    const repoPath = [parsed.basePath, includeEntry.path].filter(Boolean).join("/");
    const relativePath = normalizePortablePath(includeEntry.path);
    if (files[relativePath] !== undefined) continue;
    if (!(repoPath.endsWith(".md") || repoPath.endsWith(".yaml") || repoPath.endsWith(".yml"))) continue;
    files[relativePath] = await fetchText(resolveRawGitHubUrl(parsed.owner, parsed.repo, ref, repoPath));
  }

  const resolved = buildManifestFromPackageFiles(files);
  const companyLogoPath = resolved.manifest.company?.logoPath;
  if (companyLogoPath && !resolved.files[companyLogoPath]) {
    const repoPath = [parsed.basePath, companyLogoPath].filter(Boolean).join("/");
    try {
      const binary = await fetchBinary(resolveRawGitHubUrl(parsed.owner, parsed.repo, ref, repoPath));
      resolved.files[companyLogoPath] = bufferToPortableBinaryFile(binary, inferContentTypeFromPath(companyLogoPath));
    } catch (err) {
      warnings.push(
        `Failed to fetch company logo ${companyLogoPath} from GitHub: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  resolved.warnings.unshift(...warnings);
  return resolved;
}

export async function exportBundle(
  deps: CompanyPortabilityServiceDeps,
  companyId: string,
  input: CompanyPortabilityExport,
): Promise<CompanyPortabilityExportResult> {
  const include = normalizeInclude({
    ...input.include,
    agents: input.agents && input.agents.length > 0 ? true : input.include?.agents,
    projects: input.projects && input.projects.length > 0 ? true : input.include?.projects,
    issues:
      (input.issues && input.issues.length > 0) || (input.projectIssues && input.projectIssues.length > 0)
        ? true
        : input.include?.issues,
    skills: input.skills && input.skills.length > 0 ? true : input.include?.skills,
  });
  const company = await deps.companies.getById(companyId);
  if (!company) throw notFound("Company not found");

  const files: Record<string, CompanyPortabilityFileEntry> = {};
  const warnings: string[] = [];
  const envInputs: CompanyPortabilityManifest["envInputs"] = [];
  const requestedSidebarOrder = normalizePortableSidebarOrder(input.sidebarOrder);
  const rootPath = normalizeAgentUrlKey(company.name) ?? "company-package";
  let companyLogoPath: string | null = null;

  const allAgentRows = include.agents ? await deps.agents.list(companyId, { includeTerminated: true }) : [];
  const liveAgentRows = allAgentRows.filter((agent) => agent.status !== "terminated");
  const companySkillRows = include.skills || include.agents ? await deps.companySkills.listFull(companyId) : [];
  if (include.agents) {
    const skipped = allAgentRows.length - liveAgentRows.length;
    if (skipped > 0) {
      warnings.push(`Skipped ${skipped} terminated agent${skipped === 1 ? "" : "s"} from export.`);
    }
  }

  const agentByReference = new Map<string, (typeof liveAgentRows)[number]>();
  for (const agent of liveAgentRows) {
    agentByReference.set(agent.id, agent);
    agentByReference.set(agent.name, agent);
    const normalizedName = normalizeAgentUrlKey(agent.name);
    if (normalizedName) {
      agentByReference.set(normalizedName, agent);
    }
  }

  const selectedAgents = new Map<string, (typeof liveAgentRows)[number]>();
  for (const selector of input.agents ?? []) {
    const trimmed = selector.trim();
    if (!trimmed) continue;
    const normalized = normalizeAgentUrlKey(trimmed) ?? trimmed;
    const match = agentByReference.get(trimmed) ?? agentByReference.get(normalized);
    if (!match) {
      warnings.push(`Agent selector "${selector}" was not found and was skipped.`);
      continue;
    }
    selectedAgents.set(match.id, match);
  }

  if (include.agents && selectedAgents.size === 0) {
    for (const agent of liveAgentRows) {
      selectedAgents.set(agent.id, agent);
    }
  }

  const agentRows = Array.from(selectedAgents.values()).sort((left, right) => left.name.localeCompare(right.name));

  const usedSlugs = new Set<string>();
  const idToSlug = new Map<string, string>();
  for (const agent of agentRows) {
    const baseSlug = toSafeSlug(agent.name, "agent");
    const slug = uniqueSlug(baseSlug, usedSlugs);
    idToSlug.set(agent.id, slug);
  }

  const projectsSvc = deps.projects;
  const issuesSvc = deps.issues;
  const routinesSvc = routineService(deps.db);
  const allProjectsRaw = include.projects || include.issues ? await projectsSvc.list(companyId) : [];
  const allProjects = allProjectsRaw.filter((project) => !project.archivedAt);
  const allRoutines = include.issues ? await routinesSvc.list(companyId) : [];
  const projectById = new Map(allProjects.map((project) => [project.id, project]));
  const projectByReference = new Map<string, (typeof allProjects)[number]>();
  for (const project of allProjects) {
    projectByReference.set(project.id, project);
    projectByReference.set(project.urlKey, project);
  }

  const selectedProjects = new Map<string, (typeof allProjects)[number]>();
  const normalizeProjectSelector = (selector: string) => selector.trim().toLowerCase();
  for (const selector of input.projects ?? []) {
    const match = projectByReference.get(selector) ?? projectByReference.get(normalizeProjectSelector(selector));
    if (!match) {
      warnings.push(`Project selector "${selector}" was not found and was skipped.`);
      continue;
    }
    selectedProjects.set(match.id, match);
  }

  // selectedIssues holds full issue rows (with description) keyed by id.
  // We accumulate listed-issue stubs first, then batch-fetch descriptions in one query.
  const selectedIssues = new Map<string, Awaited<ReturnType<typeof issuesSvc.getById>>>();
  const selectedRoutines = new Map<string, (typeof allRoutines)[number]>();
  const routineById = new Map(allRoutines.map((routine) => [routine.id, routine]));
  const resolveIssueBySelector = async (selector: string) => {
    const trimmed = selector.trim();
    if (!trimmed) return null;
    return trimmed.includes("-") ? issuesSvc.getByIdentifier(trimmed, companyId) : issuesSvc.getById(trimmed);
  };
  for (const selector of input.issues ?? []) {
    const issue = await resolveIssueBySelector(selector);
    if (!issue || issue.companyId !== companyId) {
      const routine = routineById.get(selector.trim());
      if (routine) {
        selectedRoutines.set(routine.id, routine);
        if (routine.projectId) {
          const parentProject = projectById.get(routine.projectId);
          if (parentProject) selectedProjects.set(parentProject.id, parentProject);
        }
        continue;
      }
      warnings.push(`Issue selector "${selector}" was not found and was skipped.`);
      continue;
    }
    selectedIssues.set(issue.id, issue);
    if (issue.projectId) {
      const parentProject = projectById.get(issue.projectId);
      if (parentProject) selectedProjects.set(parentProject.id, parentProject);
    }
  }

  for (const selector of input.projectIssues ?? []) {
    const match = projectByReference.get(selector) ?? projectByReference.get(normalizeProjectSelector(selector));
    if (!match) {
      warnings.push(`Project-issues selector "${selector}" was not found and was skipped.`);
      continue;
    }
    selectedProjects.set(match.id, match);
    // Batch-fetch descriptions for all listed issues in this project rather than N+1 getById calls.
    const projectIssues = await issuesSvc.list(companyId, { projectId: match.id });
    const projectIssueDetails = await issuesSvc.findDetailsByIds(projectIssues.map((li) => li.id));
    for (const issue of projectIssueDetails) {
      selectedIssues.set(issue.id, issue);
    }
    for (const routine of allRoutines.filter((entry) => entry.projectId === match.id)) {
      selectedRoutines.set(routine.id, routine);
    }
  }

  if (include.projects && selectedProjects.size === 0) {
    for (const project of allProjects) {
      selectedProjects.set(project.id, project);
    }
  }

  if (include.issues && selectedIssues.size === 0) {
    // Batch-fetch descriptions for all company issues rather than N+1 getById calls.
    const allIssues = await issuesSvc.list(companyId);
    const allIssueDetails = await issuesSvc.findDetailsByIds(allIssues.map((li) => li.id));
    for (const issue of allIssueDetails) {
      selectedIssues.set(issue.id, issue);
      if (issue.projectId) {
        const parentProject = projectById.get(issue.projectId);
        if (parentProject) selectedProjects.set(parentProject.id, parentProject);
      }
    }
    if (selectedRoutines.size === 0) {
      for (const routine of allRoutines) {
        selectedRoutines.set(routine.id, routine);
        if (routine.projectId) {
          const parentProject = projectById.get(routine.projectId);
          if (parentProject) selectedProjects.set(parentProject.id, parentProject);
        }
      }
    }
  }

  const selectedProjectRows = Array.from(selectedProjects.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const selectedIssueRows = Array.from(selectedIssues.values())
    .filter((issue): issue is NonNullable<typeof issue> => issue != null)
    .sort((left, right) => (left.identifier ?? left.title).localeCompare(right.identifier ?? right.title));
  const selectedRoutineSummaries = Array.from(selectedRoutines.values()).sort((left, right) =>
    left.title.localeCompare(right.title),
  );
  const selectedRoutineRows = (
    await Promise.all(selectedRoutineSummaries.map((routine) => routinesSvc.getDetail(routine.id)))
  ).filter((routine): routine is RoutineLike => routine !== null);

  const taskSlugByIssueId = new Map<string, string>();
  const taskSlugByRoutineId = new Map<string, string>();
  const usedTaskSlugs = new Set<string>();
  for (const issue of selectedIssueRows) {
    const baseSlug = normalizeAgentUrlKey(issue.identifier ?? issue.title) ?? "task";
    taskSlugByIssueId.set(issue.id, uniqueSlug(baseSlug, usedTaskSlugs));
  }
  for (const routine of selectedRoutineRows) {
    const baseSlug = normalizeAgentUrlKey(routine.title) ?? "task";
    taskSlugByRoutineId.set(routine.id, uniqueSlug(baseSlug, usedTaskSlugs));
  }

  const projectSlugById = new Map<string, string>();
  const projectWorkspaceKeyByProjectId = new Map<string, Map<string, string>>();
  const usedProjectSlugs = new Set<string>();
  for (const project of selectedProjectRows) {
    const baseSlug = deriveProjectUrlKey(project.name, project.name);
    projectSlugById.set(project.id, uniqueSlug(baseSlug, usedProjectSlugs));
  }
  const sidebarOrder =
    requestedSidebarOrder ??
    stripEmptyValues({
      agents: sortAgentsBySidebarOrder(Array.from(selectedAgents.values()))
        .map((agent) => idToSlug.get(agent.id))
        .filter((slug): slug is string => Boolean(slug)),
      projects: selectedProjectRows
        .map((project) => projectSlugById.get(project.id))
        .filter((slug): slug is string => Boolean(slug)),
    });

  const companyPath = "COMPANY.md";
  files[companyPath] = buildMarkdown(
    {
      name: company.name,
      description: company.description ?? null,
      schema: "agentcompanies/v1",
      slug: rootPath,
    },
    "",
  );

  if (include.company && company.logoAssetId) {
    if (!deps.storage) {
      warnings.push("Skipped company logo from export because storage is unavailable.");
    } else {
      const logoAsset = await deps.assetRecords.getById(company.logoAssetId);
      if (!logoAsset) {
        warnings.push(`Skipped company logo ${company.logoAssetId} because the asset record was not found.`);
      } else {
        try {
          const object = await deps.storage!.getObject(company.id, logoAsset.objectKey);
          const body = await streamToBuffer(object.stream);
          companyLogoPath = `images/${COMPANY_LOGO_FILE_NAME}${resolveCompanyLogoExtension(logoAsset.contentType, logoAsset.originalFilename)}`;
          files[companyLogoPath] = bufferToPortableBinaryFile(body, logoAsset.contentType);
        } catch (err) {
          warnings.push(
            `Failed to export company logo ${company.logoAssetId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  const ironworksAgentsOut: Record<string, Record<string, unknown>> = {};
  const ironworksProjectsOut: Record<string, Record<string, unknown>> = {};
  const ironworksTasksOut: Record<string, Record<string, unknown>> = {};
  const unportableTaskWorkspaceRefs = new Map<string, { workspaceId: string; taskSlugs: string[] }>();
  const ironworksRoutinesOut: Record<string, Record<string, unknown>> = {};

  const skillByReference = new Map<string, (typeof companySkillRows)[number]>();
  for (const skill of companySkillRows) {
    skillByReference.set(skill.id, skill);
    skillByReference.set(skill.key, skill);
    skillByReference.set(skill.slug, skill);
    skillByReference.set(skill.name, skill);
  }
  const selectedSkills = new Map<string, (typeof companySkillRows)[number]>();
  for (const selector of input.skills ?? []) {
    const trimmed = selector.trim();
    if (!trimmed) continue;
    const normalized = normalizeSkillKey(trimmed) ?? normalizeSkillSlug(trimmed) ?? trimmed;
    const match = skillByReference.get(trimmed) ?? skillByReference.get(normalized);
    if (!match) {
      warnings.push(`Skill selector "${selector}" was not found and was skipped.`);
      continue;
    }
    selectedSkills.set(match.id, match);
  }
  if (selectedSkills.size === 0) {
    for (const skill of companySkillRows) {
      selectedSkills.set(skill.id, skill);
    }
  }
  const selectedSkillRows = Array.from(selectedSkills.values()).sort((left, right) =>
    left.key.localeCompare(right.key),
  );

  const skillExportDirs = buildSkillExportDirMap(selectedSkillRows, company.issuePrefix);
  for (const skill of selectedSkillRows) {
    const packageDir = skillExportDirs.get(skill.key) ?? `skills/${normalizeSkillSlug(skill.slug) ?? "skill"}`;
    if (shouldReferenceSkillOnExport(skill, Boolean(input.expandReferencedSkills))) {
      files[`${packageDir}/SKILL.md`] = await buildReferencedSkillMarkdown(skill);
      continue;
    }

    for (const inventoryEntry of skill.fileInventory) {
      const fileDetail = await deps.companySkills.readFile(companyId, skill.id, inventoryEntry.path).catch(() => null);
      if (!fileDetail) continue;
      const filePath = `${packageDir}/${inventoryEntry.path}`;
      files[filePath] =
        inventoryEntry.path === "SKILL.md"
          ? await withSkillSourceMetadata(skill, fileDetail.content)
          : fileDetail.content;
    }
  }

  if (include.agents) {
    for (const agent of agentRows) {
      const slug = idToSlug.get(agent.id)!;
      const exportedInstructions = await deps.instructions.exportFiles(agent);
      warnings.push(...exportedInstructions.warnings);

      const envInputsStart = envInputs.length;
      const exportedEnvInputs = extractPortableEnvInputs(
        slug,
        (agent.adapterConfig as Record<string, unknown>).env,
        warnings,
      );
      envInputs.push(...exportedEnvInputs);
      const adapterDefaultRules = ADAPTER_DEFAULT_RULES_BY_TYPE[agent.adapterType] ?? [];
      const portableAdapterConfig = pruneDefaultLikeValue(normalizePortableConfig(agent.adapterConfig), {
        dropFalseBooleans: true,
        defaultRules: adapterDefaultRules,
      }) as Record<string, unknown>;
      const portableRuntimeConfig = pruneDefaultLikeValue(normalizePortableConfig(agent.runtimeConfig), {
        dropFalseBooleans: true,
        defaultRules: RUNTIME_DEFAULT_RULES,
      }) as Record<string, unknown>;
      const portablePermissions = pruneDefaultLikeValue(agent.permissions ?? {}, { dropFalseBooleans: true }) as Record<
        string,
        unknown
      >;
      const agentEnvInputs = dedupeEnvInputs(
        envInputs.slice(envInputsStart).filter((inputValue) => inputValue.agentSlug === slug),
      );
      const reportsToSlug = agent.reportsTo ? (idToSlug.get(agent.reportsTo) ?? null) : null;
      const desiredSkills = readIronworksSkillSyncPreference(
        (agent.adapterConfig as Record<string, unknown>) ?? {},
      ).desiredSkills;

      const commandValue = asString(portableAdapterConfig.command);
      if (commandValue && isAbsoluteCommand(commandValue)) {
        warnings.push(`Agent ${slug} command ${commandValue} was omitted from export because it is system-dependent.`);
        delete portableAdapterConfig.command;
      }
      for (const [relativePath, content] of Object.entries(exportedInstructions.files)) {
        const targetPath = `agents/${slug}/${relativePath}`;
        if (relativePath === exportedInstructions.entryFile) {
          files[targetPath] = buildMarkdown(
            stripEmptyValues({
              name: agent.name,
              title: agent.title ?? null,
              reportsTo: reportsToSlug,
              skills: desiredSkills.length > 0 ? desiredSkills : undefined,
            }) as Record<string, unknown>,
            content,
          );
        } else {
          files[targetPath] = content;
        }
      }

      const extension = stripEmptyValues({
        role: agent.role !== "agent" ? agent.role : undefined,
        icon: agent.icon ?? null,
        capabilities: agent.capabilities ?? null,
        adapter: {
          type: agent.adapterType,
          config: portableAdapterConfig,
        },
        runtime: portableRuntimeConfig,
        permissions: portablePermissions,
        budgetMonthlyCents: (agent.budgetMonthlyCents ?? 0) > 0 ? agent.budgetMonthlyCents : undefined,
        metadata: (agent.metadata as Record<string, unknown> | null) ?? null,
      });
      if (isPlainRecord(extension) && agentEnvInputs.length > 0) {
        extension.inputs = {
          env: buildEnvInputMap(agentEnvInputs),
        };
      }
      ironworksAgentsOut[slug] = isPlainRecord(extension) ? extension : {};
    }
  }

  for (const project of selectedProjectRows) {
    const slug = projectSlugById.get(project.id)!;
    const projectPath = `projects/${slug}/PROJECT.md`;
    const portableWorkspaces = await buildPortableProjectWorkspaces(slug, project.workspaces, warnings);
    projectWorkspaceKeyByProjectId.set(project.id, portableWorkspaces.workspaceKeyById);
    files[projectPath] = buildMarkdown(
      {
        name: project.name,
        description: project.description ?? null,
        owner: project.leadAgentId ? (idToSlug.get(project.leadAgentId) ?? null) : null,
      },
      project.description ?? "",
    );
    const extension = stripEmptyValues({
      leadAgentSlug: project.leadAgentId ? (idToSlug.get(project.leadAgentId) ?? null) : null,
      targetDate: project.targetDate ?? null,
      color: project.color ?? null,
      status: project.status,
      executionWorkspacePolicy:
        exportPortableProjectExecutionWorkspacePolicy(
          slug,
          project.executionWorkspacePolicy,
          portableWorkspaces.workspaceKeyById,
          warnings,
        ) ?? undefined,
      workspaces: portableWorkspaces.extension,
    });
    ironworksProjectsOut[slug] = isPlainRecord(extension) ? extension : {};
  }

  for (const issue of selectedIssueRows) {
    const taskSlug = taskSlugByIssueId.get(issue.id)!;
    const projectSlug = issue.projectId ? (projectSlugById.get(issue.projectId) ?? null) : null;
    // All tasks go in top-level tasks/ folder, never nested under projects/
    const taskPath = `tasks/${taskSlug}/TASK.md`;
    const assigneeSlug = issue.assigneeAgentId ? (idToSlug.get(issue.assigneeAgentId) ?? null) : null;
    const projectWorkspaceKey =
      issue.projectId && issue.projectWorkspaceId
        ? (projectWorkspaceKeyByProjectId.get(issue.projectId)?.get(issue.projectWorkspaceId) ?? null)
        : null;
    if (issue.projectWorkspaceId && !projectWorkspaceKey) {
      const aggregateKey = `${issue.projectId ?? "no-project"}:${issue.projectWorkspaceId}`;
      const existing = unportableTaskWorkspaceRefs.get(aggregateKey);
      if (existing) {
        existing.taskSlugs.push(taskSlug);
      } else {
        unportableTaskWorkspaceRefs.set(aggregateKey, {
          workspaceId: issue.projectWorkspaceId,
          taskSlugs: [taskSlug],
        });
      }
    }
    files[taskPath] = buildMarkdown(
      {
        name: issue.title,
        project: projectSlug,
        assignee: assigneeSlug,
      },
      issue.description ?? "",
    );
    const extension = stripEmptyValues({
      identifier: issue.identifier,
      status: issue.status,
      priority: issue.priority,
      labelIds: issue.labelIds ?? undefined,
      billingCode: issue.billingCode ?? null,
      projectWorkspaceKey: projectWorkspaceKey ?? undefined,
      executionWorkspaceSettings: issue.executionWorkspaceSettings ?? undefined,
      assigneeAdapterOverrides: issue.assigneeAdapterOverrides ?? undefined,
    });
    ironworksTasksOut[taskSlug] = isPlainRecord(extension) ? extension : {};
  }

  for (const { workspaceId, taskSlugs } of unportableTaskWorkspaceRefs.values()) {
    const preview = taskSlugs.slice(0, 4).join(", ");
    const remainder = taskSlugs.length > 4 ? ` and ${taskSlugs.length - 4} more` : "";
    warnings.push(
      `Tasks ${preview}${remainder} reference workspace ${workspaceId}, but that workspace could not be exported portably.`,
    );
  }

  for (const routine of selectedRoutineRows) {
    const taskSlug = taskSlugByRoutineId.get(routine.id)!;
    const projectSlug = routine.projectId ? (projectSlugById.get(routine.projectId) ?? null) : null;
    const taskPath = `tasks/${taskSlug}/TASK.md`;
    const assigneeSlug = routine.assigneeAgentId ? (idToSlug.get(routine.assigneeAgentId) ?? null) : null;
    files[taskPath] = buildMarkdown(
      {
        name: routine.title,
        project: projectSlug,
        assignee: assigneeSlug,
        recurring: true,
      },
      routine.description ?? "",
    );
    const extension = stripEmptyValues({
      status: routine.status !== "active" ? routine.status : undefined,
      priority: routine.priority !== "medium" ? routine.priority : undefined,
      concurrencyPolicy: routine.concurrencyPolicy !== "coalesce_if_active" ? routine.concurrencyPolicy : undefined,
      catchUpPolicy: routine.catchUpPolicy !== "skip_missed" ? routine.catchUpPolicy : undefined,
      triggers: routine.triggers.map((trigger: RoutineLike["triggers"][number]) =>
        stripEmptyValues({
          kind: trigger.kind,
          label: trigger.label ?? null,
          enabled: trigger.enabled ? undefined : false,
          cronExpression: trigger.kind === "schedule" ? (trigger.cronExpression ?? null) : undefined,
          timezone: trigger.kind === "schedule" ? (trigger.timezone ?? null) : undefined,
          signingMode:
            trigger.kind === "webhook" && trigger.signingMode !== "bearer" ? (trigger.signingMode ?? null) : undefined,
          replayWindowSec:
            trigger.kind === "webhook" && trigger.replayWindowSec !== 300
              ? (trigger.replayWindowSec ?? null)
              : undefined,
        }),
      ),
    });
    ironworksRoutinesOut[taskSlug] = isPlainRecord(extension) ? extension : {};
  }

  const ironworksExtensionPath = ".ironworks.yaml";
  const ironworksAgents = Object.fromEntries(
    Object.entries(ironworksAgentsOut).filter(([, value]) => isPlainRecord(value) && Object.keys(value).length > 0),
  );
  const ironworksProjects = Object.fromEntries(
    Object.entries(ironworksProjectsOut).filter(([, value]) => isPlainRecord(value) && Object.keys(value).length > 0),
  );
  const ironworksTasks = Object.fromEntries(
    Object.entries(ironworksTasksOut).filter(([, value]) => isPlainRecord(value) && Object.keys(value).length > 0),
  );
  const ironworksRoutines = Object.fromEntries(
    Object.entries(ironworksRoutinesOut).filter(([, value]) => isPlainRecord(value) && Object.keys(value).length > 0),
  );
  files[ironworksExtensionPath] = buildYamlFile(
    {
      schema: "ironworks/v1",
      company: stripEmptyValues({
        brandColor: company.brandColor ?? null,
        logoPath: companyLogoPath,
        requireBoardApprovalForNewAgents: company.requireBoardApprovalForNewAgents ? undefined : false,
      }),
      sidebar: stripEmptyValues(sidebarOrder),
      agents: Object.keys(ironworksAgents).length > 0 ? ironworksAgents : undefined,
      projects: Object.keys(ironworksProjects).length > 0 ? ironworksProjects : undefined,
      tasks: Object.keys(ironworksTasks).length > 0 ? ironworksTasks : undefined,
      routines: Object.keys(ironworksRoutines).length > 0 ? ironworksRoutines : undefined,
    },
    { preserveEmptyStrings: true },
  );

  const finalFiles = filterExportFiles(files, input.selectedFiles, ironworksExtensionPath);
  let resolved = buildManifestFromPackageFiles(finalFiles, {
    sourceLabel: {
      companyId: company.id,
      companyName: company.name,
    },
  });
  resolved.manifest.includes = {
    company: resolved.manifest.company !== null,
    agents: resolved.manifest.agents.length > 0,
    projects: resolved.manifest.projects.length > 0,
    issues: resolved.manifest.issues.length > 0,
    skills: resolved.manifest.skills.length > 0,
  };
  resolved.manifest.envInputs = dedupeEnvInputs(envInputs);
  resolved.warnings.unshift(...warnings);

  // Generate org chart PNG from manifest agents
  if (resolved.manifest.agents.length > 0) {
    try {
      const orgNodes = buildOrgTreeFromManifest(resolved.manifest.agents);
      const pngBuffer = await renderOrgChartPng(orgNodes);
      finalFiles["images/org-chart.png"] = bufferToPortableBinaryFile(pngBuffer, "image/png");
    } catch {
      // Non-fatal: export still works without the org chart image
    }
  }

  if (!input.selectedFiles || input.selectedFiles.some((entry) => normalizePortablePath(entry) === "README.md")) {
    finalFiles["README.md"] = generateReadme(resolved.manifest, {
      companyName: company.name,
      companyDescription: company.description ?? null,
    });
  }

  resolved = buildManifestFromPackageFiles(finalFiles, {
    sourceLabel: {
      companyId: company.id,
      companyName: company.name,
    },
  });
  resolved.manifest.includes = {
    company: resolved.manifest.company !== null,
    agents: resolved.manifest.agents.length > 0,
    projects: resolved.manifest.projects.length > 0,
    issues: resolved.manifest.issues.length > 0,
    skills: resolved.manifest.skills.length > 0,
  };
  resolved.manifest.envInputs = dedupeEnvInputs(envInputs);
  resolved.warnings.unshift(...warnings);

  return {
    rootPath,
    manifest: resolved.manifest,
    files: finalFiles,
    warnings: resolved.warnings,
    ironworksExtensionPath,
  };
}

export async function previewExport(
  deps: CompanyPortabilityServiceDeps,
  companyId: string,
  input: CompanyPortabilityExport,
): Promise<CompanyPortabilityExportPreviewResult> {
  const previewInput: CompanyPortabilityExport = {
    ...input,
    include: {
      ...input.include,
      issues:
        input.include?.issues ??
        Boolean((input.issues && input.issues.length > 0) || (input.projectIssues && input.projectIssues.length > 0)) ??
        false,
    },
  };
  if (previewInput.include && previewInput.include.issues === undefined) {
    previewInput.include.issues = false;
  }
  const exported = await exportBundle(deps, companyId, previewInput);
  return {
    ...exported,
    fileInventory: Object.keys(exported.files)
      .sort((left, right) => left.localeCompare(right))
      .map((filePath) => ({
        path: filePath,
        kind: classifyPortableFileKind(filePath),
      })),
    counts: {
      files: Object.keys(exported.files).length,
      agents: exported.manifest.agents.length,
      skills: exported.manifest.skills.length,
      projects: exported.manifest.projects.length,
      issues: exported.manifest.issues.length,
    },
  };
}
