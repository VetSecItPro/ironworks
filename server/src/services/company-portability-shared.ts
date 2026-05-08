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
