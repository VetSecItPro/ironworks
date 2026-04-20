import type {
  CompanyPortabilityExportResult,
  CompanyPortabilityFileEntry,
  CompanyPortabilityManifest,
} from "@ironworksai/shared";
import { createZipArchive } from "../../lib/zip";
import type { FileTreeNode } from "../PackageFileTree";
import { collectAllPaths } from "../PackageFileTree";

/**
 * Extract the set of agent/project/task slugs that are "checked" based on
 * which file paths are in the checked set.
 */
export function checkedSlugs(checkedFiles: Set<string>): {
  agents: Set<string>;
  projects: Set<string>;
  tasks: Set<string>;
  routines: Set<string>;
} {
  const agents = new Set<string>();
  const projects = new Set<string>();
  const tasks = new Set<string>();
  for (const p of checkedFiles) {
    const agentMatch = p.match(/^agents\/([^/]+)\//);
    if (agentMatch) agents.add(agentMatch[1]);
    const projectMatch = p.match(/^projects\/([^/]+)\//);
    if (projectMatch) projects.add(projectMatch[1]);
    const taskMatch = p.match(/^tasks\/([^/]+)\//);
    if (taskMatch) tasks.add(taskMatch[1]);
  }
  return { agents, projects, tasks, routines: new Set(tasks) };
}

/**
 * Filter .ironworks.yaml content so it only includes entries whose
 * corresponding files are checked.
 */
export function filterIronworksYaml(yaml: string, checkedFiles: Set<string>): string {
  const slugs = checkedSlugs(checkedFiles);
  const lines = yaml.split("\n");
  const out: string[] = [];

  const filterableSections = new Set(["agents", "projects", "tasks", "routines"]);
  const sidebarSections = new Set(["agents", "projects"]);

  let currentSection: string | null = null;
  let currentEntry: string | null = null;
  let includeEntry = true;
  let currentSidebarList: string | null = null;
  let currentSidebarHeaderLine: string | null = null;
  let currentSidebarBuffer: string[] = [];
  let sectionHeaderLine: string | null = null;
  let sectionBuffer: string[] = [];

  function flushSidebarSection() {
    if (currentSidebarHeaderLine !== null && currentSidebarBuffer.length > 0) {
      sectionBuffer.push(currentSidebarHeaderLine);
      sectionBuffer.push(...currentSidebarBuffer);
    }
    currentSidebarHeaderLine = null;
    currentSidebarBuffer = [];
  }

  function flushSection() {
    flushSidebarSection();
    if (sectionHeaderLine !== null && sectionBuffer.length > 0) {
      out.push(sectionHeaderLine);
      out.push(...sectionBuffer);
    }
    sectionHeaderLine = null;
    sectionBuffer = [];
  }

  for (const line of lines) {
    const topMatch = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (topMatch && !line.startsWith(" ")) {
      flushSection();
      currentEntry = null;
      includeEntry = true;

      const key = topMatch[0].split(":")[0];
      if (filterableSections.has(key)) {
        currentSection = key;
        sectionHeaderLine = line;
        continue;
      } else if (key === "sidebar") {
        currentSection = key;
        currentSidebarList = null;
        sectionHeaderLine = line;
        continue;
      } else {
        currentSection = null;
        out.push(line);
        continue;
      }
    }

    if (currentSection === "sidebar") {
      const sidebarMatch = line.match(/^ {2}([\w-]+):\s*$/);
      if (sidebarMatch && !line.startsWith("    ")) {
        flushSidebarSection();
        const sidebarKey = sidebarMatch[1];
        currentSidebarList = sidebarKey && sidebarSections.has(sidebarKey) ? sidebarKey : null;
        currentSidebarHeaderLine = currentSidebarList ? line : null;
        continue;
      }

      const sidebarEntryMatch = line.match(/^ {4}- ["']?([^"'\n]+)["']?\s*$/);
      if (sidebarEntryMatch && currentSidebarList) {
        const slug = sidebarEntryMatch[1];
        const sectionSlugs = slugs[currentSidebarList as keyof typeof slugs];
        if (slug && sectionSlugs.has(slug)) {
          currentSidebarBuffer.push(line);
        }
        continue;
      }

      if (currentSidebarList) {
        currentSidebarBuffer.push(line);
        continue;
      }
    }

    if (currentSection && filterableSections.has(currentSection)) {
      const entryMatch = line.match(/^ {2}([\w][\w-]*):\s*(.*)$/);
      if (entryMatch && !line.startsWith("    ")) {
        const slug = entryMatch[1];
        currentEntry = slug;
        const sectionSlugs = slugs[currentSection as keyof typeof slugs];
        includeEntry = sectionSlugs.has(slug);
        if (includeEntry) sectionBuffer.push(line);
        continue;
      }

      if (currentEntry !== null) {
        if (includeEntry) sectionBuffer.push(line);
        continue;
      }

      sectionBuffer.push(line);
      continue;
    }

    out.push(line);
  }

  flushSection();

  let filtered = out.join("\n");
  const logoPathMatch = filtered.match(/^\s{2}logoPath:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (logoPathMatch && !checkedFiles.has(logoPathMatch[1]!)) {
    filtered = filtered.replace(/^\s{2}logoPath:\s*["']?([^"'\n]+)["']?\s*\n?/m, "");
  }

  return filtered;
}

/** Filter tree nodes whose path (or descendant paths) match a search string */
export function filterTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  return nodes
    .map((node) => {
      if (node.kind === "file") {
        return node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower) ? node : null;
      }
      const filteredChildren = filterTree(node.children, query);
      return filteredChildren.length > 0 ? { ...node, children: filteredChildren } : null;
    })
    .filter((n): n is FileTreeNode => n !== null);
}

/** Collect all ancestor dir paths for files that match a filter */
export function collectMatchedParentDirs(nodes: FileTreeNode[], query: string): Set<string> {
  const dirs = new Set<string>();
  const lower = query.toLowerCase();

  function walk(node: FileTreeNode, ancestors: string[]) {
    if (node.kind === "file") {
      if (node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower)) {
        for (const a of ancestors) dirs.add(a);
      }
    } else {
      for (const child of node.children) {
        walk(child, [...ancestors, node.path]);
      }
    }
  }

  for (const node of nodes) walk(node, []);
  return dirs;
}

/** Sort tree: checked files first, then unchecked */
export function sortByChecked(nodes: FileTreeNode[], checkedFiles: Set<string>): FileTreeNode[] {
  return nodes
    .map((node) => {
      if (node.kind === "dir") {
        return { ...node, children: sortByChecked(node.children, checkedFiles) };
      }
      return node;
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "file" ? -1 : 1;
      if (a.kind === "file" && b.kind === "file") {
        const aChecked = checkedFiles.has(a.path);
        const bChecked = checkedFiles.has(b.path);
        if (aChecked !== bChecked) return aChecked ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

export const TASKS_PAGE_SIZE = 10;

/**
 * Paginate children of `tasks/` directories.
 */
export function paginateTaskNodes(
  nodes: FileTreeNode[],
  limit: number,
  checkedFiles: Set<string>,
  searchQuery: string,
): { nodes: FileTreeNode[]; totalTaskChildren: number; visibleTaskChildren: number } {
  let totalTaskChildren = 0;
  let visibleTaskChildren = 0;

  const result = nodes.map((node) => {
    if (node.kind === "dir" && node.name === "tasks") {
      totalTaskChildren = node.children.length;

      const pinned: FileTreeNode[] = [];
      const rest: FileTreeNode[] = [];
      const lower = searchQuery.toLowerCase();

      for (const child of node.children) {
        const childFiles = collectAllPaths([child], "file");
        const isChecked = [...childFiles].some((p) => checkedFiles.has(p));
        const isSearchMatch =
          searchQuery &&
          (child.name.toLowerCase().includes(lower) ||
            child.path.toLowerCase().includes(lower) ||
            [...childFiles].some((p) => p.toLowerCase().includes(lower)));
        if (isChecked || isSearchMatch) {
          pinned.push(child);
        } else {
          rest.push(child);
        }
      }

      const remaining = Math.max(0, limit - pinned.length);
      const visible = [...pinned, ...rest.slice(0, remaining)];
      visibleTaskChildren = visible.length;

      return { ...node, children: visible };
    }
    return node;
  });

  return { nodes: result, totalTaskChildren, visibleTaskChildren };
}

export function downloadZip(
  exported: CompanyPortabilityExportResult,
  selectedFiles: Set<string>,
  effectiveFiles: Record<string, CompanyPortabilityFileEntry>,
) {
  const filteredFiles: Record<string, CompanyPortabilityFileEntry> = {};
  for (const [path] of Object.entries(exported.files)) {
    if (selectedFiles.has(path)) filteredFiles[path] = effectiveFiles[path] ?? exported.files[path];
  }
  const zipBytes = createZipArchive(filteredFiles, exported.rootPath);
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(zipBuffer).set(zipBytes);
  const blob = new Blob([zipBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${exported.rootPath}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Extract the file path from the current URL pathname */
export function filePathFromLocation(pathname: string): string | null {
  const marker = "/company/export/files/";
  const idx = pathname.indexOf(marker);
  if (idx === -1) return null;
  const filePath = decodeURIComponent(pathname.slice(idx + marker.length));
  return filePath || null;
}

/** Expand all ancestor directories for a given file path */
export function expandAncestors(filePath: string): string[] {
  const parts = filePath.split("/").slice(0, -1);
  const dirs: string[] = [];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    dirs.push(current);
  }
  return dirs;
}

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO",
  cto: "CTO",
  cmo: "CMO",
  cfo: "CFO",
  coo: "COO",
  vp: "VP",
  manager: "Manager",
  engineer: "Engineer",
  agent: "Agent",
};

/**
 * Regenerate README.md content based on the currently checked files.
 */
export function generateReadmeFromSelection(
  manifest: CompanyPortabilityManifest,
  checkedFiles: Set<string>,
  companyName: string,
  companyDescription: string | null,
): string {
  const slugs = checkedSlugs(checkedFiles);

  const agents = manifest.agents.filter((a) => slugs.agents.has(a.slug));
  const projects = manifest.projects.filter((p) => slugs.projects.has(p.slug));
  const tasks = manifest.issues.filter((t) => slugs.tasks.has(t.slug));
  const skills = manifest.skills.filter((s) => {
    return [...checkedFiles].some(
      (f) => f.startsWith(`skills/${s.key}/`) || (f.startsWith(`skills/`) && f.includes(`/${s.slug}/`)),
    );
  });

  const lines: string[] = [];
  lines.push(`# ${companyName}`);
  lines.push("");
  if (companyDescription) {
    lines.push(`> ${companyDescription}`);
    lines.push("");
  }
  if (agents.length > 0) {
    lines.push("![Org Chart](images/org-chart.png)");
    lines.push("");
  }

  lines.push("## What's Inside");
  lines.push("");
  lines.push("This is an [Agent Company](https://PLACEHOLDER_IRONWORKS_DOT_ING) package.");
  lines.push("");

  const counts: Array<[string, number]> = [];
  if (agents.length > 0) counts.push(["Agents", agents.length]);
  if (projects.length > 0) counts.push(["Projects", projects.length]);
  if (skills.length > 0) counts.push(["Skills", skills.length]);
  if (tasks.length > 0) counts.push(["Tasks", tasks.length]);

  if (counts.length > 0) {
    lines.push("| Content | Count |");
    lines.push("|---------|-------|");
    for (const [label, count] of counts) {
      lines.push(`| ${label} | ${count} |`);
    }
    lines.push("");
  }

  if (agents.length > 0) {
    lines.push("### Agents");
    lines.push("");
    lines.push("| Agent | Role | Reports To |");
    lines.push("|-------|------|------------|");
    for (const agent of agents) {
      const roleLabel = ROLE_LABELS[agent.role] ?? agent.role;
      const reportsTo = agent.reportsToSlug ?? "\u2014";
      lines.push(`| ${agent.name} | ${roleLabel} | ${reportsTo} |`);
    }
    lines.push("");
  }

  if (projects.length > 0) {
    lines.push("### Projects");
    lines.push("");
    for (const project of projects) {
      const desc = project.description ? ` \u2014 ${project.description}` : "";
      lines.push(`- **${project.name}**${desc}`);
    }
    lines.push("");
  }

  lines.push("## Getting Started");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm ironworksai company import this-github-url-or-folder");
  lines.push("```");
  lines.push("");
  lines.push("See [Ironworks](https://PLACEHOLDER_IRONWORKS_DOT_ING) for more information.");
  lines.push("");
  lines.push("---");
  lines.push(
    `Exported from [Ironworks](https://PLACEHOLDER_IRONWORKS_DOT_ING) on ${new Date().toISOString().split("T")[0]}`,
  );
  lines.push("");

  return lines.join("\n");
}
