import { describe, expect, it } from "vitest";
import { type Issue, type IssueComment, renderIssue } from "../render-issue.js";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  const base: Issue = {
    id: "00000000-0000-0000-0000-0000000000b1",
    companyId: "00000000-0000-0000-0000-0000000000aa",
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Wire OAuth provider",
    description: "Implement OAuth.",
    status: "in_progress",
    priority: "high",
    assigneeAgentId: null,
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    issueNumber: 42,
    identifier: "ENG-42",
    originKind: "manual",
    originId: null,
    originRunId: null,
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    targetDate: null,
    specTemplate: null,
    dependsOn: [],
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
  };
  return { ...base, ...overrides };
}

function makeComment(overrides: Partial<IssueComment> = {}): IssueComment {
  const base: IssueComment = {
    id: "00000000-0000-0000-0000-0000000000c1",
    companyId: "00000000-0000-0000-0000-0000000000aa",
    issueId: "00000000-0000-0000-0000-0000000000b1",
    authorAgentId: null,
    authorUserId: null,
    body: "Looks good.",
    replyToId: null,
    createdAt: new Date("2026-05-02T12:00:00.000Z"),
    updatedAt: new Date("2026-05-02T12:00:00.000Z"),
  };
  return { ...base, ...overrides };
}

describe("renderIssue", () => {
  it("renders full frontmatter, heading, description, assigned line, and comments", () => {
    const issue = makeIssue({
      assigneeAgentId: "00000000-0000-0000-0000-0000000000ab",
      projectId: "00000000-0000-0000-0000-0000000000ac",
      parentId: "00000000-0000-0000-0000-0000000000ad",
      targetDate: new Date("2026-06-01T00:00:00.000Z"),
      dependsOn: ["00000000-0000-0000-0000-0000000000ae"],
    });
    const comments = [
      makeComment({ authorAgentId: "00000000-0000-0000-0000-0000000000ab", body: "Starting work." }),
      makeComment({
        id: "00000000-0000-0000-0000-0000000000c2",
        authorUserId: "user_abc",
        body: "Multi\nline\ncomment.",
        createdAt: new Date("2026-05-02T13:00:00.000Z"),
      }),
    ];

    const result = renderIssue({ issue, comments, assignedAgentSlug: "atlas-engineer" });

    expect(result.path).toBe("issues/ENG-42.md");
    expect(result.content).toContain("type: issue");
    expect(result.content).toContain("identifier: ENG-42");
    expect(result.content).toContain("issue_number: 42");
    expect(result.content).toContain("status: in_progress");
    expect(result.content).toContain("priority: high");
    expect(result.content).toContain("origin_kind: manual");
    expect(result.content).toContain("project_id: 00000000-0000-0000-0000-0000000000ac");
    expect(result.content).toContain("parent_id: 00000000-0000-0000-0000-0000000000ad");
    expect(result.content).toContain("assignee_agent_id: 00000000-0000-0000-0000-0000000000ab");
    expect(result.content).toContain("target_date: '2026-06-01T00:00:00.000Z'");
    expect(result.content).toContain("depends_on:");
    expect(result.content).toContain("# ENG-42: Wire OAuth provider");
    expect(result.content).toContain("## Description");
    expect(result.content).toContain("Implement OAuth.");
    expect(result.content).toContain("Assigned: [[atlas-engineer]]");
    expect(result.content).toContain("## Comments");
    expect(result.content).toContain(
      "[[agent:00000000-0000-0000-0000-0000000000ab]] said on 2026-05-02T12:00:00.000Z:",
    );
    expect(result.content).toContain("> Starting work.");
    expect(result.content).toContain("[[user:user_abc]] said on 2026-05-02T13:00:00.000Z:");
    expect(result.content).toContain("> Multi\n> line\n> comment.");
  });

  it("omits optional null frontmatter keys, omits Comments and Assigned when absent", () => {
    const issue = makeIssue({
      identifier: null,
      issueNumber: null,
      projectId: null,
      parentId: null,
      assigneeAgentId: null,
      assigneeUserId: null,
      targetDate: null,
      dependsOn: [],
    });

    const result = renderIssue({ issue, comments: [], assignedAgentSlug: null });

    expect(result.content).not.toContain("identifier:");
    expect(result.content).not.toContain("issue_number:");
    expect(result.content).not.toContain("project_id:");
    expect(result.content).not.toContain("parent_id:");
    expect(result.content).not.toContain("assignee_agent_id:");
    expect(result.content).not.toContain("target_date:");
    expect(result.content).not.toContain("depends_on:");
    expect(result.content).not.toContain("Assigned:");
    expect(result.content).not.toContain("## Comments");
    // Path falls back to id when no identifier
    expect(result.path).toBe("issues/00000000-0000-0000-0000-0000000000b1.md");
  });

  it("renders no-description placeholder", () => {
    const issue = makeIssue({ description: null });
    const result = renderIssue({ issue, comments: [], assignedAgentSlug: null });
    expect(result.content).toContain("_(no description)_");
  });

  it("anonymous author label when neither agent nor user set", () => {
    const issue = makeIssue();
    const comments = [makeComment({ body: "ghost" })];
    const result = renderIssue({ issue, comments, assignedAgentSlug: null });
    expect(result.content).toContain("[[unknown]]");
  });

  it("sanitizes hostile identifiers in path", () => {
    const issue = makeIssue({ identifier: "ENG/42:bad" });
    const result = renderIssue({ issue, comments: [], assignedAgentSlug: null });
    expect(result.path).toBe("issues/ENG_42_bad.md");
  });
});
