// Public API shell for company portability.
// Shared helpers live in company-portability-shared.ts
// Export logic lives in company-portability-export.ts
// Import logic lives in company-portability-import.ts

import type { Db } from "@ironworksai/db";
import type {
  CompanyPortabilityExport,
  CompanyPortabilityImport,
  CompanyPortabilityPreview,
} from "@ironworksai/shared";
import type { StorageService } from "../storage/types.js";
import { accessService } from "./access.js";
import { agentInstructionsService } from "./agent-instructions.js";
import { agentService } from "./agents.js";
import { assetService } from "./assets.js";
import { companyService } from "./companies.js";
import { exportBundle as _exportBundle, previewExport as _previewExport } from "./company-portability-export.js";
import { importBundle as _importBundle, previewImport as _previewImport } from "./company-portability-import.js";
import type { CompanyPortabilityServiceDeps, ImportBehaviorOptions } from "./company-portability-shared.js";
import { companySkillService } from "./company-skills.js";
import { issueService } from "./issues.js";
import { projectService } from "./projects.js";

export type { ImportBehaviorOptions } from "./company-portability-shared.js";
export { parseGitHubSourceUrl } from "./company-portability-shared.js";

export function companyPortabilityService(db: Db, storage?: StorageService) {
  const deps: CompanyPortabilityServiceDeps = {
    companies: companyService(db),
    agents: agentService(db),
    assetRecords: assetService(db),
    instructions: agentInstructionsService(),
    access: accessService(db),
    projects: projectService(db),
    issues: issueService(db),
    companySkills: companySkillService(db),
    db,
    storage,
  };

  return {
    exportBundle: (companyId: string, input: CompanyPortabilityExport) => _exportBundle(deps, companyId, input),
    previewExport: (companyId: string, input: CompanyPortabilityExport) => _previewExport(deps, companyId, input),
    previewImport: (input: CompanyPortabilityPreview, options?: ImportBehaviorOptions) =>
      _previewImport(deps, input, options),
    importBundle: (
      input: CompanyPortabilityImport,
      actorUserId: string | null | undefined,
      options?: ImportBehaviorOptions,
    ) => _importBundle(deps, input, actorUserId, options),
  };
}
