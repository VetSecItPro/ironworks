# @ironworksai/shared

Shared TypeScript types and enumerations used across IronWorks packages (server, UI, CLI, adapters).

## Purpose

This package is the single source of truth for domain types that must remain in lockstep across the client/server boundary. Whenever a type is consumed by more than one package, it lives here — so any change produces a compile error everywhere it's used, rather than silent drift.

## Shape

The package exposes types only — no runtime logic, no side effects. The main entrypoint re-exports category-scoped type modules:

- `types/adapter.ts` — `AdapterType` enum and adapter configuration unions
- `types/agent.ts` — agent identities, roles, status
- `types/company.ts` — company, membership, portability
- `types/issue.ts` — issue, goal, and project types
- `types/workspace.ts` — workspace runtime contracts

## Importing

```ts
import type { AdapterType, AgentStatus, CompanyPortabilityFileEntry } from "@ironworksai/shared";
```

All exports are types; any attempt to import a value (function, class, constant) from this package is a compile error by design.

## Testing

No tests — types are verified via `pnpm -r typecheck` across downstream packages.

## License

MIT
