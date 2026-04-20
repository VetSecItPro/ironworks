import { vi } from "vitest";

/**
 * Full-shape mock of `server/src/services/index.ts` for test files that need
 * to stub the services module.
 *
 * The reason this helper exists: vitest caches module graphs across test files
 * within a fork. When 37+ files each declare partial `vi.mock("../services/index.js")`
 * factories with different property subsets, a cached route module can bind to a
 * sibling file's mock shape — producing `undefined` for a service the current
 * test's expectations rely on. The observable symptom is "expected 403, got 200"
 * flakes in authorization paths.
 *
 * By giving every test file the same canonical shape via this helper — with only
 * the file-specific overrides diverging — partial-shape ambiguity becomes
 * structurally impossible. A test that reaches a service it didn't configure
 * gets a safe `vi.fn()` stub rather than `undefined`.
 *
 * Keep in sync with `server/src/services/index.ts` runtime exports. Type-only
 * exports are intentionally omitted — types don't exist at runtime.
 */
export function makeFullServicesMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    // ─── Service factories (called with db, return methods) ────────────────
    accessService: vi.fn(() => ({})),
    activityService: vi.fn(() => ({})),
    agentInstructionsService: vi.fn(() => ({})),
    agentService: vi.fn(() => ({})),
    approvalService: vi.fn(() => ({})),
    assetService: vi.fn(() => ({})),
    billingService: vi.fn(() => ({})),
    boardAuthService: vi.fn(() => ({})),
    budgetService: vi.fn(() => ({})),
    companyPortabilityService: vi.fn(() => ({})),
    companyService: vi.fn(() => ({})),
    companySkillService: vi.fn(() => ({})),
    costService: vi.fn(() => ({})),
    dashboardService: vi.fn(() => ({})),
    documentService: vi.fn(() => ({})),
    executionWorkspaceService: vi.fn(() => ({})),
    executiveAnalyticsService: vi.fn(() => ({})),
    financeService: vi.fn(() => ({})),
    goalService: vi.fn(() => ({})),
    heartbeatService: vi.fn(() => ({})),
    instanceSettingsService: vi.fn(() => ({})),
    issueApprovalService: vi.fn(() => ({})),
    issueService: vi.fn(() => ({})),
    messagingBridgeService: vi.fn(() => ({})),
    playbookService: vi.fn(() => ({})),
    projectService: vi.fn(() => ({})),
    routineService: vi.fn(() => ({})),
    secretService: vi.fn(() => ({})),
    sidebarBadgeService: vi.fn(() => ({})),
    userInviteService: vi.fn(() => ({})),
    workProductService: vi.fn(() => ({})),
    workspaceOperationService: vi.fn(() => ({})),

    // ─── Standalone functions (all return undefined by default) ────────────
    archiveAgentWorkspace: vi.fn(),
    budgetForecast: vi.fn(),
    buildMorningBriefing: vi.fn(),
    buildOnboardingPacket: vi.fn(),
    captureAllPerformanceSnapshots: vi.fn(),
    capturePerformanceSnapshot: vi.fn(),
    checkAllAgentAchievements: vi.fn(),
    checkAndGrantAchievements: vi.fn(),
    checkContractorLifecycles: vi.fn(),
    computeAgentUtilization: vi.fn(),
    computeDORAMetrics: vi.fn(),
    computeGoalHealth: vi.fn(),
    computePerformanceScore: vi.fn(),
    consolidateMemories: vi.fn(),
    createAgentDocument: vi.fn(),
    createAgentWorkspace: vi.fn(),
    createDecisionRecord: vi.fn(),
    createEmploymentHistoryEntry: vi.fn(),
    createHandoffIssue: vi.fn(),
    createHiringRecord: vi.fn(),
    createPerformanceReview: vi.fn(),
    createPostMortem: vi.fn(),
    createQualityGateReview: vi.fn(),
    createStorageServiceFromConfig: vi.fn(),
    createTerminationRecord: vi.fn(),
    decayStaleMemories: vi.fn(),
    deduplicateAgentName: vi.fn(),
    detectContextDrift: vi.fn(),
    enforceMemoryCap: vi.fn(),
    evaluateQualityGate: vi.fn(),
    extractLegacyPlanBody: vi.fn(),
    extractLessonFromRejection: vi.fn(),
    extractMemoriesFromIssue: vi.fn(),
    findRelevantMemories: vi.fn(),
    generateAgentWeeklyReport: vi.fn(),
    generateBoardMeetingPacket: vi.fn(),
    generateCFOWeeklyReport: vi.fn(),
    generateClientUpdate: vi.fn(),
    generateCompanyWeeklyReport: vi.fn(),
    generateDailyStandup: vi.fn(),
    generateHRWeeklyReport: vi.fn(),
    generateMeetingMinutes: vi.fn(),
    generateMonthlyCostSummary: vi.fn(),
    generatePromptOptimizationSuggestion: vi.fn(),
    generateRetrospective: vi.fn(),
    generateTeamRetrospective: vi.fn(),
    getAgentDocuments: vi.fn(),
    getContextualMemories: vi.fn(),
    getLatestSessionState: vi.fn(),
    getMemoryHealth: vi.fn(),
    getQualityExamples: vi.fn(),
    getReviewRequirements: vi.fn(),
    getStorageService: vi.fn(),
    getVelocityData: vi.fn(),
    identifySkillGaps: vi.fn(),
    logActivity: vi.fn(),
    notifyHireApproved: vi.fn(),
    performPostTaskReflection: vi.fn(),
    promoteToRun: vi.fn(),
    pruneContextIfNeeded: vi.fn(),
    publishLiveEvent: vi.fn(),
    reconcilePersistedRuntimeServicesOnStartup: vi.fn(),
    recordCompletion: vi.fn(),
    recordQualityExample: vi.fn(),
    resolveQualityGate: vi.fn(),
    reviewOutputQuality: vi.fn(),
    runAllAchievementChecks: vi.fn(),
    runAllDailyStandups: vi.fn(),
    runAllMonthlyCostSummaries: vi.fn(),
    runAllTeamRetrospectives: vi.fn(),
    runAllWeeklyReports: vi.fn(),
    runDailyStandups: vi.fn(),
    runWeeklyReports: vi.fn(),
    saveSessionState: vi.fn(),
    seedSystemRoleTemplates: vi.fn(),
    snapshotAllCompanyGoals: vi.fn(),
    snapshotAllGoals: vi.fn(),
    snapshotGoal: vi.fn(),
    subscribeCompanyLiveEvents: vi.fn(),
    syncInstructionsBundleConfigFromFilePath: vi.fn(),
    systemHealthSummary: vi.fn(),
    updateAllPerformanceScores: vi.fn(),
    updateTechDebtRegister: vi.fn(),
    validateConfidenceTags: vi.fn(),
    validateSpec: vi.fn(),
    verifyPolarWebhookSignature: vi.fn(),

    // ─── Constants (sensible defaults — tests may override) ────────────────
    ACHIEVEMENTS: [],
    CONFIDENCE_TAGGING_PROMPT: "",
    PLAN_DEFINITIONS: [],

    // ─── Caller-supplied overrides (last — wins over any default) ──────────
    ...overrides,
  };
}
