// Type definitions for the company-portability shared service module.
// Pure types only — no runtime code lives here.

import type { Db } from "@ironworksai/db";
import type {
  CompanyPortabilityAgentManifestEntry,
  CompanyPortabilityCollisionStrategy,
  CompanyPortabilityFileEntry,
  CompanyPortabilityInclude,
  CompanyPortabilityManifest,
  CompanyPortabilityPreviewResult,
} from "@ironworksai/shared";
import type { StorageService } from "../storage/types.js";
import type { accessService } from "./access.js";
import type { agentInstructionsService } from "./agent-instructions.js";
import type { agentService } from "./agents.js";
import type { assetService } from "./assets.js";
import type { companyService } from "./companies.js";
import type { companySkillService } from "./company-skills.js";
import type { issueService } from "./issues.js";
import type { projectService } from "./projects.js";
import type { routineService } from "./routines.js";

export type ResolvedSource = {
  manifest: CompanyPortabilityManifest;
  files: Record<string, CompanyPortabilityFileEntry>;
  warnings: string[];
};

export type MarkdownDoc = {
  frontmatter: Record<string, unknown>;
  body: string;
};

export type ProjectLike = {
  id: string;
  name: string;
  description: string | null;
  leadAgentId: string | null;
  targetDate: string | null;
  color: string | null;
  status: string;
  executionWorkspacePolicy: Record<string, unknown> | null;
  workspaces?: Array<{
    id: string;
    name: string;
    sourceType: string;
    cwd: string | null;
    repoUrl: string | null;
    repoRef: string | null;
    defaultRef: string | null;
    visibility: string;
    setupCommand: string | null;
    cleanupCommand: string | null;
    metadata?: Record<string, unknown> | null;
    isPrimary: boolean;
  }>;
  metadata?: Record<string, unknown> | null;
};

export type IssueLike = {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  projectId: string | null;
  projectWorkspaceId: string | null;
  assigneeAgentId: string | null;
  status: string;
  priority: string;
  labelIds?: string[];
  billingCode: string | null;
  executionWorkspaceSettings: Record<string, unknown> | null;
  assigneeAdapterOverrides: Record<string, unknown> | null;
};

export type RoutineLike = NonNullable<Awaited<ReturnType<ReturnType<typeof routineService>["getDetail"]>>>;

export type ImportPlanInternal = {
  preview: CompanyPortabilityPreviewResult;
  source: ResolvedSource;
  include: CompanyPortabilityInclude;
  collisionStrategy: CompanyPortabilityCollisionStrategy;
  selectedAgents: CompanyPortabilityAgentManifestEntry[];
};

export type ImportMode = "board_full" | "agent_safe";

export type ImportBehaviorOptions = {
  mode?: ImportMode;
  sourceCompanyId?: string | null;
};

export type AgentLike = {
  id: string;
  name: string;
  adapterConfig: Record<string, unknown>;
};

export type CompanyPortabilityServiceDeps = {
  companies: ReturnType<typeof companyService>;
  agents: ReturnType<typeof agentService>;
  assetRecords: ReturnType<typeof assetService>;
  instructions: ReturnType<typeof agentInstructionsService>;
  access: ReturnType<typeof accessService>;
  projects: ReturnType<typeof projectService>;
  issues: ReturnType<typeof issueService>;
  companySkills: ReturnType<typeof companySkillService>;
  db: Db;
  storage: StorageService | undefined;
};
