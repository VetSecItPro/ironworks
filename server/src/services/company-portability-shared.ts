// Re-exports from the 6 domain files split out for navigability.
// All exports of the original 2,660-line file remain importable through this path
// for back-compat with existing callers (company-portability.ts,
// company-portability-export.ts, company-portability-import.ts, agent-yaml-io.ts).
//
// Domain layout:
//   - types.ts            : type definitions only
//   - defaults.ts         : module constants, primitive type guards, mode helpers
//   - skill-helpers.ts    : skill key/slug derivation, org tree, source entries
//   - path-helpers.ts     : path normalization, namespace derivation, GitHub URL parsing
//   - env-helpers.ts      : env-key handling and execFileAsync
//   - manifest-helpers.ts : YAML/markdown parsing+rendering, manifest builder, routines,
//                           workspaces, file-map utilities, network helpers

export * from "./company-portability-defaults.js";
export * from "./company-portability-env-helpers.js";
export * from "./company-portability-manifest-helpers.js";
export * from "./company-portability-path-helpers.js";
export * from "./company-portability-skill-helpers.js";
export * from "./company-portability-types.js";

// Canonical entity-Frontmatter types + helpers (T2 module). Re-exported here so
// callers that only know the company-portability-shared.ts surface can reach
// the canonical module without a separate import. Note: `renderFrontmatter`
// in this barrel still refers to the legacy agentcompanies/v1 package-manifest
// emitter (different schema, different YAML quirks pinned by tests). The
// canonical entity emitter is exposed as `renderEntityFrontmatter` to avoid
// shadowing — entity files (knowledge/decision/skill/agent/project/issue/run)
// use that one; package-manifest files (COMPANY/AGENT/PROJECT/TASK.md) keep
// the legacy emitter.
export {
  type AgentFrontmatter,
  type AnyFrontmatter,
  type BaseFrontmatter,
  type DecisionFrontmatter,
  type EntityType,
  type IssueFrontmatter,
  type KnowledgeFrontmatter,
  parseFrontmatter,
  type ProjectFrontmatter,
  renderEntityFrontmatter,
  type RunFrontmatter,
  type SkillFrontmatter,
} from "@ironworksai/shared";
