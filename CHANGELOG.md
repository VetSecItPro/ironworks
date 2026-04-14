# Changelog

All notable changes to IronWorks are documented in this file.

## [Unreleased]

### Added
- Dashboard improvements: Mission Control alignment (StatusBar, QuickActionsGrid, TwoPaneLayout, PageTabBar actions)
- Component-first architecture: 7 oversized files decomposed, barrel exports, shared types directory
- React.memo on 7 list/card components, loading state fix on 14 pages
- Biome linter configuration
- Vitest coverage configuration with v8 provider
- E2E tests triggered on pull requests
- OG metadata and meta description

### Changed
- Tabs default to line variant with primary-colored accent border
- Card component gains accentColor and fadeOverflow props
- Dashboard section titles now link to their full pages
- LICENSE copyright updated to Steel Motion LLC

### Security
- Path traversal prevention on file-serving routes
- SSRF protection extended with IPv6 private ranges
- Timing-safe token comparison in board-claim
- Prompt injection patterns expanded from 5 to 16
- Dependency overrides for rollup, kysely, vite, lodash-es CVEs

### Fixed
- 9 icon-only buttons missing aria-labels
- docs.json GitHub links pointed to wrong org

## [0.3.1] - 2026-04-08

### Added
- @mention agent-to-agent waking + board user icon
- Agent chat architecture with Response Router
- Channel message posting from heartbeat runs
- AI-native governance seed docs (30 templates)
- Nolan integration (12 requirements)
- Deliverables workflow, threads, session handling, decision log

### Changed
- Heartbeat interval configurable, default 30s
- Diversified model assignments with automatic fallback
- Agents conversational when no issues assigned

### Security
- 107 tests for security-critical code paths
- WCAG 2.1 AA compliance (16 violations fixed)
- Rate limit increased to 600/min, heartbeat paths exempt

### Fixed
- Channel extraction and response formatting
- Docker build ordering (db+shared before server)
- Sidebar scroll, panel clipping
- Billing subscription 404 console noise
