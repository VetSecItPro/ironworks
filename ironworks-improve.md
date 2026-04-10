# Ironworks Dashboard Improvements

Aligning Ironworks (Paperclip fork) dashboard with OpenClaw Mission Control patterns and quality bar.

---

## Wave 1 - Quick Wins

- [x] **1.1** Switch tabs to `line` variant with accent-colored bottom border (2px) across all pages
- [x] **1.2** Add `border-left` accent indicator on selected list items
- [x] **1.3** Fix loading state pattern: `if (isLoading && !data)` instead of `if (isLoading)` to prevent flash on tab switch
- [x] **1.4** Add `accentColor` prop to shared Card component for colored top border stripe
- [x] **1.5** Add fade gradient overlay on card content overflow
- [x] **1.6** Wire dashboard card titles to navigate to their full pages on click

## Wave 2 - Architecture Cleanup

- [x] **2.1** Extract shared types to `ui/src/types/` directory with domain files
- [x] **2.2** Add barrel exports (index.ts) to all component subdirectories
- [x] **2.3** Decompose pages over 400 lines (IssueDetail, CompanySkills, KnowledgeBase, BoardBriefing)
- [x] **2.4** Decompose oversized components (OnboardingWizard, NewIssueDialog, AgentConfigForm)
- [x] **2.5** React.memo audit - wrap list item and card components that render in loops

## Wave 3 - New Features

- [x] **3.1** Add fixed status bar at bottom showing system metrics (agent count, active runs)
- [x] **3.2** Create shared `TwoPaneLayout` component with `gridTemplateColumns: "360px 1fr"` pattern
- [x] **3.3** Inline action buttons and filter pills on tab bar rows (PageTabBar actions prop)
- [x] **3.4** Quick Actions grid on dashboard for common actions across all pages
- [x] **3.5** Cross-entity linking: issues link to related agents/projects, dashboard cards navigate to full pages

## Wave 4 - Security Hardening

- [x] **4.1** Audit and add path traversal prevention (workspace allowlists, path.resolve + startsWith)
- [x] **4.2** SSRF protection: URL validation blocking private IPs on proxy/reader endpoints
- [x] **4.3** Timing-safe comparison for secret/token verification
- [x] **4.4** Prompt injection sanitization on LLM endpoints
- [x] **4.5** Pin GitHub Actions to SHA hashes in CI workflows (already done)
