# ADR-0001: Component-First Architecture

## Status

Accepted

## Context

Early page files in the UI grew into monoliths combining data fetching, state management, layout, and individual UI sections in single files exceeding 800+ lines. This made code review harder, increased merge conflicts, and slowed onboarding for new contributors (human or agent). A consistent structural rule was needed that every developer could follow without ambiguity.

## Decision

Adopt a component-first architecture with these constraints:

1. **Page files are orchestrators only.** They handle route params, top-level queries/mutations, layout grid, and compose child components. Maximum 400 lines.
2. **Every UI section gets its own component** in `src/components/{page-name}/`. A "section" is any visually distinct block (a card, a form panel, a table).
3. **Types live in `src/types/{domain}.ts`** - never inline in page or component files.
4. **Shared primitives** (Button, Card, Badge, Modal, etc.) live in `src/components/ui/` and must never be redefined locally.
5. **Barrel exports** (`index.ts`) are required in each component directory so imports stay clean.
6. **API routes** use a shared data layer for file I/O, shared helpers for error handling and auth, and Zod schemas for request/response validation.
7. **If any file exceeds 400 lines, it must be split before the PR ships.**

## Consequences

### Positive

- Consistent structure across the entire UI codebase.
- Smaller files reduce merge conflicts in parallel development.
- Agent contributors can follow the rule mechanically without needing design judgment.
- Code review focuses on logic, not structural debates.

### Negative

- More files and directories to navigate.
- Barrel exports add a small maintenance cost.
- Extracting components from existing monolith pages requires upfront refactoring effort.

### Neutral

- The 400-line limit is a guideline; exceptions exist for files with many small, tightly related helpers (e.g., form validation schemas).
