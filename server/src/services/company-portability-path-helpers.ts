// Path, slug-namespace, and GitHub-URL helpers for the company-portability domain.
// All functions are pure string/path manipulation — no I/O.

import { createHash } from "node:crypto";
import path from "node:path";
import type { CompanySkill } from "@ironworksai/shared";
import { unprocessable } from "../errors.js";
import { asString, isPlainRecord } from "./company-portability-defaults.js";
import { normalizeSkillKey, normalizeSkillSlug } from "./company-portability-skill-helpers.js";

export function normalizeExportPathSegment(value: string | null | undefined, preserveCase = false) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return null;
  return preserveCase ? normalized : normalized.toLowerCase();
}

function readSkillSourceKind(skill: CompanySkill) {
  const metadata = isPlainRecord(skill.metadata) ? skill.metadata : null;
  return asString(metadata?.sourceKind);
}

export function deriveLocalExportNamespace(skill: CompanySkill, slug: string) {
  const metadata = isPlainRecord(skill.metadata) ? skill.metadata : null;
  const candidates = [asString(metadata?.projectName), asString(metadata?.workspaceName)];

  if (skill.sourceLocator) {
    const basename = path.basename(skill.sourceLocator);
    candidates.push(
      basename.toLowerCase() === "skill.md" ? path.basename(path.dirname(skill.sourceLocator)) : basename,
    );
  }

  for (const value of candidates) {
    const normalized = normalizeSkillSlug(value);
    if (normalized && normalized !== slug) return normalized;
  }

  return null;
}

export function derivePrimarySkillExportDir(
  skill: CompanySkill,
  slug: string,
  companyIssuePrefix: string | null | undefined,
) {
  const normalizedKey = normalizeSkillKey(skill.key);
  const keySegments = normalizedKey?.split("/") ?? [];
  const primaryNamespace = keySegments[0] ?? null;

  if (primaryNamespace === "company") {
    const companySegment =
      normalizeExportPathSegment(companyIssuePrefix, true) ??
      normalizeExportPathSegment(keySegments[1], true) ??
      "company";
    return `skills/company/${companySegment}/${slug}`;
  }

  if (primaryNamespace === "local") {
    const localNamespace = deriveLocalExportNamespace(skill, slug);
    return localNamespace ? `skills/local/${localNamespace}/${slug}` : `skills/local/${slug}`;
  }

  if (primaryNamespace === "url") {
    let derivedHost: string | null = keySegments[1] ?? null;
    if (!derivedHost) {
      try {
        derivedHost = normalizeSkillSlug(skill.sourceLocator ? new URL(skill.sourceLocator).host : null);
      } catch {
        derivedHost = null;
      }
    }
    const host = derivedHost ?? "url";
    return `skills/url/${host}/${slug}`;
  }

  if (keySegments.length > 1) {
    return `skills/${keySegments.join("/")}`;
  }

  return `skills/${slug}`;
}

export function appendSkillExportDirSuffix(packageDir: string, suffix: string) {
  const lastSeparator = packageDir.lastIndexOf("/");
  if (lastSeparator < 0) return `${packageDir}--${suffix}`;
  return `${packageDir.slice(0, lastSeparator + 1)}${packageDir.slice(lastSeparator + 1)}--${suffix}`;
}

export function deriveSkillExportDirCandidates(
  skill: CompanySkill,
  slug: string,
  companyIssuePrefix: string | null | undefined,
) {
  const primaryDir = derivePrimarySkillExportDir(skill, slug, companyIssuePrefix);
  const metadata = isPlainRecord(skill.metadata) ? skill.metadata : null;
  const sourceKind = readSkillSourceKind(skill);
  const suffixes = new Set<string>();
  const pushSuffix = (value: string | null | undefined, preserveCase = false) => {
    const normalized = normalizeExportPathSegment(value, preserveCase);
    if (normalized && normalized !== slug) {
      suffixes.add(normalized);
    }
  };

  if (sourceKind === "ironworks_bundled") {
    pushSuffix("ironworks");
  }

  if (skill.sourceType === "github" || skill.sourceType === "skills_sh") {
    pushSuffix(asString(metadata?.repo));
    pushSuffix(asString(metadata?.owner));
    pushSuffix(skill.sourceType === "skills_sh" ? "skills_sh" : "github");
  } else if (skill.sourceType === "url") {
    try {
      pushSuffix(skill.sourceLocator ? new URL(skill.sourceLocator).host : null);
    } catch {
      // Ignore URL parse failures and fall through to generic suffixes.
    }
    pushSuffix("url");
  } else if (skill.sourceType === "local_path") {
    pushSuffix(asString(metadata?.projectName));
    pushSuffix(asString(metadata?.workspaceName));
    pushSuffix(deriveLocalExportNamespace(skill, slug));
    if (sourceKind === "managed_local") pushSuffix("company");
    if (sourceKind === "project_scan") pushSuffix("project");
    pushSuffix("local");
  } else {
    pushSuffix(sourceKind);
    pushSuffix("skill");
  }

  return [primaryDir, ...Array.from(suffixes, (suffix) => appendSkillExportDirSuffix(primaryDir, suffix))];
}

function hashSkillValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export function buildSkillExportDirMap(skills: CompanySkill[], companyIssuePrefix: string | null | undefined) {
  const usedDirs = new Set<string>();
  const keyToDir = new Map<string, string>();
  const orderedSkills = [...skills].sort((left, right) => left.key.localeCompare(right.key));
  for (const skill of orderedSkills) {
    const slug = normalizeSkillSlug(skill.slug) ?? "skill";
    const candidates = deriveSkillExportDirCandidates(skill, slug, companyIssuePrefix);

    let packageDir = candidates.find((candidate) => !usedDirs.has(candidate)) ?? null;
    if (!packageDir) {
      packageDir = appendSkillExportDirSuffix(candidates[0] ?? `skills/${slug}`, hashSkillValue(skill.key));
      while (usedDirs.has(packageDir)) {
        packageDir = appendSkillExportDirSuffix(
          candidates[0] ?? `skills/${slug}`,
          hashSkillValue(`${skill.key}:${packageDir}`),
        );
      }
    }

    usedDirs.add(packageDir);
    keyToDir.set(skill.key, packageDir);
  }

  return keyToDir;
}

export function normalizePortablePath(input: string) {
  const normalized = input.replace(/\\/g, "/").replace(/^\.\/+/, "");
  const parts: string[] = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

export function resolvePortablePath(fromPath: string, targetPath: string) {
  const baseDir = path.posix.dirname(fromPath.replace(/\\/g, "/"));
  return normalizePortablePath(path.posix.join(baseDir, targetPath.replace(/\\/g, "/")));
}

export function ensureMarkdownPath(pathValue: string) {
  const normalized = pathValue.replace(/\\/g, "/");
  if (!normalized.endsWith(".md")) {
    throw unprocessable(`Manifest file path must end in .md: ${pathValue}`);
  }
  return normalized;
}

export function normalizeGitHubSourcePath(value: string | null | undefined) {
  if (!value) return "";
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

export function parseGitHubSourceUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.hostname !== "github.com") {
    throw unprocessable("GitHub source must use github.com URL");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw unprocessable("Invalid GitHub URL");
  }
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, "");
  const queryRef = url.searchParams.get("ref")?.trim();
  const queryPath = normalizeGitHubSourcePath(url.searchParams.get("path"));
  const queryCompanyPath = normalizeGitHubSourcePath(url.searchParams.get("companyPath"));
  if (queryRef || queryPath || queryCompanyPath) {
    const companyPath = queryCompanyPath || [queryPath, "COMPANY.md"].filter(Boolean).join("/") || "COMPANY.md";
    let basePath = queryPath;
    if (!basePath && companyPath !== "COMPANY.md") {
      basePath = path.posix.dirname(companyPath);
      if (basePath === ".") basePath = "";
    }
    return {
      owner,
      repo,
      ref: queryRef || "main",
      basePath,
      companyPath,
    };
  }
  let ref = "main";
  let basePath = "";
  let companyPath = "COMPANY.md";
  if (parts[2] === "tree") {
    ref = parts[3] ?? "main";
    basePath = parts.slice(4).join("/");
  } else if (parts[2] === "blob") {
    ref = parts[3] ?? "main";
    const blobPath = parts.slice(4).join("/");
    if (!blobPath) {
      throw unprocessable("Invalid GitHub blob URL");
    }
    companyPath = blobPath;
    basePath = path.posix.dirname(blobPath);
    if (basePath === ".") basePath = "";
  }
  return { owner, repo, ref, basePath, companyPath };
}

export function resolveRawGitHubUrl(owner: string, repo: string, ref: string, filePath: string) {
  const normalizedFilePath = filePath.replace(/^\/+/, "");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${normalizedFilePath}`;
}
