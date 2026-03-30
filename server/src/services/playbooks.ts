import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { playbooks, playbookSteps } from "@ironworksai/db";

export interface CreatePlaybookInput {
  companyId: string;
  name: string;
  description?: string | null;
  body?: string | null;
  icon?: string | null;
  category?: string;
  estimatedMinutes?: number | null;
  steps?: CreateStepInput[];
}

export interface CreateStepInput {
  stepOrder: number;
  title: string;
  instructions?: string | null;
  assigneeRole?: string | null;
  dependsOn?: number[];
  estimatedMinutes?: number | null;
  requiresApproval?: boolean;
}

export function playbookService(db: Db) {
  return {
    async list(companyId: string) {
      return db
        .select()
        .from(playbooks)
        .where(eq(playbooks.companyId, companyId))
        .orderBy(asc(playbooks.category), asc(playbooks.name));
    },

    async getById(id: string) {
      const [row] = await db
        .select()
        .from(playbooks)
        .where(eq(playbooks.id, id))
        .limit(1);
      return row ?? null;
    },

    async getSteps(playbookId: string) {
      return db
        .select()
        .from(playbookSteps)
        .where(eq(playbookSteps.playbookId, playbookId))
        .orderBy(asc(playbookSteps.stepOrder));
    },

    async getWithSteps(id: string) {
      const playbook = await this.getById(id);
      if (!playbook) return null;
      const steps = await this.getSteps(id);
      return { ...playbook, steps };
    },

    async create(input: CreatePlaybookInput) {
      const [playbook] = await db
        .insert(playbooks)
        .values({
          companyId: input.companyId,
          name: input.name,
          description: input.description ?? null,
          body: input.body ?? null,
          icon: input.icon ?? null,
          category: input.category ?? "custom",
          estimatedMinutes: input.estimatedMinutes ?? null,
        })
        .returning();

      if (input.steps && input.steps.length > 0) {
        await db.insert(playbookSteps).values(
          input.steps.map((step) => ({
            playbookId: playbook.id,
            stepOrder: step.stepOrder,
            title: step.title,
            instructions: step.instructions ?? null,
            assigneeRole: step.assigneeRole ?? null,
            dependsOn: step.dependsOn ?? [],
            estimatedMinutes: step.estimatedMinutes ?? null,
            requiresApproval: step.requiresApproval ?? false,
          })),
        );
      }

      return playbook;
    },

    async update(
      id: string,
      input: Partial<Pick<CreatePlaybookInput, "name" | "description" | "body" | "icon" | "category" | "estimatedMinutes">> & { status?: string },
    ) {
      const [row] = await db
        .update(playbooks)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(playbooks.id, id))
        .returning();
      return row ?? null;
    },

    async deletePlaybook(id: string) {
      await db.delete(playbooks).where(eq(playbooks.id, id));
    },

    async incrementRunCount(id: string) {
      await db
        .update(playbooks)
        .set({
          runCount: sql`${playbooks.runCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(playbooks.id, id));
    },

    /**
     * Seed default playbooks for a company (idempotent — skips if seeded playbooks exist).
     */
    async seedDefaults(companyId: string) {
      const existing = await db
        .select({ id: playbooks.id })
        .from(playbooks)
        .where(and(eq(playbooks.companyId, companyId), eq(playbooks.isSeeded, true)))
        .limit(1);

      if (existing.length > 0) return { seeded: false, count: 0 };

      const seeds = getDefaultPlaybooks();
      let count = 0;

      for (const seed of seeds) {
        const [pb] = await db
          .insert(playbooks)
          .values({
            companyId,
            name: seed.name,
            description: seed.description,
            body: seed.body,
            icon: seed.icon,
            category: seed.category,
            isSeeded: true,
            estimatedMinutes: seed.estimatedMinutes,
          })
          .returning();

        if (seed.steps.length > 0) {
          await db.insert(playbookSteps).values(
            seed.steps.map((step) => ({
              playbookId: pb.id,
              stepOrder: step.stepOrder,
              title: step.title,
              instructions: step.instructions,
              assigneeRole: step.assigneeRole,
              dependsOn: step.dependsOn,
              estimatedMinutes: step.estimatedMinutes,
              requiresApproval: step.requiresApproval ?? false,
            })),
          );
        }
        count++;
      }

      return { seeded: true, count };
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Seed Playbook Definitions                                          */
/* ------------------------------------------------------------------ */

function getDefaultPlaybooks() {
  return [
    {
      name: "New Client Onboarding",
      description: "End-to-end client onboarding from project creation to final delivery",
      body: "Orchestrates the full onboarding journey for a new client. The CEO creates the project and defines goals, the CTO designs the technical architecture, SecurityEngineer runs a baseline audit, DevOpsEngineer provisions infrastructure, ContentMarketer writes documentation, and the CEO delivers the final package to the client.",
      icon: "user-plus",
      category: "onboarding",
      estimatedMinutes: 240,
      steps: [
        { stepOrder: 1, title: "Create project and define goals", instructions: "Create a new project for the client. Define 3-5 measurable goals based on the client brief. Set timeline milestones and assign a budget.", assigneeRole: "ceo", dependsOn: [], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 2, title: "Design technical architecture", instructions: "Review the project goals and design the system architecture. Produce an architecture diagram, technology stack recommendation, and integration plan. Document all decisions in a design doc.", assigneeRole: "cto", dependsOn: [1], estimatedMinutes: 60, requiresApproval: false },
        { stepOrder: 3, title: "Run security baseline audit", instructions: "Perform a security baseline assessment on the proposed architecture. Check for OWASP Top 10 risks, data handling compliance, and authentication/authorization design. Produce a findings report.", assigneeRole: "securityengineer", dependsOn: [2], estimatedMinutes: 45, requiresApproval: false },
        { stepOrder: 4, title: "Provision infrastructure", instructions: "Set up the development and staging environments based on the architecture design. Configure CI/CD pipelines, monitoring, and alerting. Document all infrastructure in a runbook.", assigneeRole: "devopsengineer", dependsOn: [2], estimatedMinutes: 60, requiresApproval: false },
        { stepOrder: 5, title: "Write onboarding documentation", instructions: "Create client-facing documentation: getting started guide, API reference (if applicable), FAQ, and support contact info. Write internal team onboarding notes.", assigneeRole: "contentmarketer", dependsOn: [3, 4], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 6, title: "Review and deliver to client", instructions: "Review all deliverables from previous steps. Compile the final onboarding package. Schedule and conduct the client handoff meeting. Ensure all documentation is accessible.", assigneeRole: "ceo", dependsOn: [5], estimatedMinutes: 30, requiresApproval: true },
      ],
    },
    {
      name: "Security Audit",
      description: "Comprehensive security assessment with findings report and remediation plan",
      body: "A structured security audit that covers dependency scanning, code review, and threat modeling. Produces an executive summary suitable for stakeholders and a detailed remediation plan with prioritized action items.",
      icon: "shield-check",
      category: "security",
      estimatedMinutes: 180,
      steps: [
        { stepOrder: 1, title: "Define audit scope", instructions: "Identify which systems, repositories, and services are in scope. Document the attack surface, data classification, and compliance requirements. Create the audit plan.", assigneeRole: "securityengineer", dependsOn: [], estimatedMinutes: 20, requiresApproval: false },
        { stepOrder: 2, title: "Dependency and supply chain scan", instructions: "Run automated dependency scanning (npm audit, pip-audit, etc.) across all in-scope repos. Flag critical/high vulnerabilities. Check for known compromised packages.", assigneeRole: "securityengineer", dependsOn: [1], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 3, title: "Code security review", instructions: "Review code for OWASP Top 10 vulnerabilities: injection, broken auth, XSS, insecure deserialization, etc. Check for hardcoded secrets, unsafe deserialization, and missing input validation.", assigneeRole: "securityengineer", dependsOn: [1], estimatedMinutes: 45, requiresApproval: false },
        { stepOrder: 4, title: "Architecture threat model", instructions: "Create a threat model for the system architecture. Identify trust boundaries, data flows, and potential attack vectors. Use STRIDE or similar framework. Document mitigations.", assigneeRole: "cto", dependsOn: [2, 3], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 5, title: "Write findings report", instructions: "Compile all findings into a structured report: executive summary, methodology, findings by severity (critical/high/medium/low), evidence, and recommended fixes. Include a risk matrix.", assigneeRole: "securityengineer", dependsOn: [4], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 6, title: "Create remediation plan", instructions: "Prioritize findings by risk and effort. Create actionable remediation tasks with owners and deadlines. Estimate effort for each fix. Group into sprints if applicable.", assigneeRole: "cto", dependsOn: [5], estimatedMinutes: 20, requiresApproval: false },
        { stepOrder: 7, title: "Executive summary and sign-off", instructions: "Write a 1-page executive summary for leadership. Highlight critical risks, overall security posture, and top 3 recommended actions. Present to CEO for sign-off.", assigneeRole: "ceo", dependsOn: [6], estimatedMinutes: 15, requiresApproval: true },
      ],
    },
    {
      name: "Product Launch",
      description: "Coordinate a full product release from feature freeze to post-launch monitoring",
      body: "A structured launch process that ensures quality, security, and communication are all handled before and after deployment. Covers QA, performance, security review, deployment, monitoring, and announcements.",
      icon: "rocket",
      category: "engineering",
      estimatedMinutes: 300,
      steps: [
        { stepOrder: 1, title: "Feature freeze and scope lock", instructions: "Declare feature freeze. Verify all planned features are merged. Create a release branch. Document what's included in the release and what was deferred.", assigneeRole: "cto", dependsOn: [], estimatedMinutes: 20, requiresApproval: false },
        { stepOrder: 2, title: "QA pass", instructions: "Run full test suite. Perform manual testing of critical user flows. Verify all acceptance criteria are met. Document any bugs found and their severity.", assigneeRole: "seniorengineer", dependsOn: [1], estimatedMinutes: 60, requiresApproval: false },
        { stepOrder: 3, title: "Performance audit", instructions: "Run performance benchmarks. Check page load times, API response times, and resource usage. Compare against baseline metrics. Flag any regressions.", assigneeRole: "seniorengineer", dependsOn: [1], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 4, title: "Security review", instructions: "Quick security review of all changes in the release. Check for new dependencies, API surface changes, and authentication/authorization modifications.", assigneeRole: "securityengineer", dependsOn: [1], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 5, title: "Deploy to production", instructions: "Execute the deployment plan. Run database migrations if needed. Verify health checks pass. Keep rollback plan ready. Monitor error rates during deployment.", assigneeRole: "devopsengineer", dependsOn: [2, 3, 4], estimatedMinutes: 30, requiresApproval: true },
        { stepOrder: 6, title: "Post-launch monitoring", instructions: "Monitor production for 2 hours post-deploy. Watch error rates, latency, and key business metrics. Verify all critical flows work in production.", assigneeRole: "devopsengineer", dependsOn: [5], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 7, title: "Write release notes and announce", instructions: "Write user-facing release notes highlighting new features and improvements. Create internal changelog. Publish announcement to appropriate channels.", assigneeRole: "contentmarketer", dependsOn: [5], estimatedMinutes: 20, requiresApproval: false },
        { stepOrder: 8, title: "Launch review", instructions: "Conduct a brief launch retrospective. What went well? What needs improvement? Update the launch playbook with lessons learned.", assigneeRole: "ceo", dependsOn: [6, 7], estimatedMinutes: 15, requiresApproval: false },
      ],
    },
    {
      name: "Incident Response",
      description: "Structured response to production incidents with triage, fix, and postmortem",
      body: "When production breaks, follow this playbook. It ensures rapid triage, clear ownership, systematic investigation, verified fixes, and thorough documentation so the same issue doesn't happen twice.",
      icon: "siren",
      category: "operations",
      estimatedMinutes: 120,
      steps: [
        { stepOrder: 1, title: "Triage and classify", instructions: "Determine severity (P1-P4). Identify affected systems and user impact. Set up an incident channel. Assign an incident commander. Communicate initial status to stakeholders.", assigneeRole: "cto", dependsOn: [], estimatedMinutes: 10, requiresApproval: false },
        { stepOrder: 2, title: "Investigate root cause", instructions: "Review logs, metrics, and recent deployments. Identify the root cause or contributing factors. Document the investigation timeline. If cause is unclear after 30 min, escalate.", assigneeRole: "seniorengineer", dependsOn: [1], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 3, title: "Implement fix", instructions: "Develop and test the fix. For P1/P2: hotfix directly to production. For P3/P4: follow normal PR flow but expedited. Include rollback plan.", assigneeRole: "seniorengineer", dependsOn: [2], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 4, title: "Verify fix in production", instructions: "Deploy the fix. Verify the issue is resolved by checking the same symptoms that triggered the incident. Monitor for 30 minutes. Confirm metrics return to baseline.", assigneeRole: "devopsengineer", dependsOn: [3], estimatedMinutes: 15, requiresApproval: false },
        { stepOrder: 5, title: "Write postmortem", instructions: "Document: timeline, root cause, impact (users affected, duration), what went well, what went wrong, and 3-5 specific action items with owners and due dates. No blame — focus on systems.", assigneeRole: "cto", dependsOn: [4], estimatedMinutes: 20, requiresApproval: false },
        { stepOrder: 6, title: "Stakeholder communication", instructions: "Send incident resolution notice to affected stakeholders. Include: what happened, impact, what we did, and what we're doing to prevent recurrence. Keep it concise and factual.", assigneeRole: "ceo", dependsOn: [5], estimatedMinutes: 15, requiresApproval: true },
      ],
    },
    {
      name: "Content Campaign",
      description: "Plan, create, review, and publish a multi-channel content campaign",
      body: "A full content campaign lifecycle from strategy to metrics tracking. Coordinates research, content creation, design, editorial review, publication, and performance measurement.",
      icon: "megaphone",
      category: "marketing",
      estimatedMinutes: 200,
      steps: [
        { stepOrder: 1, title: "Research and strategy", instructions: "Research target audience, competitor content, and trending topics. Define campaign goals (leads, awareness, SEO). Create a content brief with key messages, tone, and target channels.", assigneeRole: "contentmarketer", dependsOn: [], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 2, title: "Create content calendar", instructions: "Map out content pieces across channels (blog, social, email, etc.). Set publishing dates. Assign content types to each slot. Ensure variety and consistent messaging.", assigneeRole: "contentmarketer", dependsOn: [1], estimatedMinutes: 20, requiresApproval: false },
        { stepOrder: 3, title: "Write content pieces", instructions: "Write all content pieces per the calendar. Follow the brand voice guide. Include CTAs. Optimize for SEO where applicable. Write social media variants.", assigneeRole: "contentmarketer", dependsOn: [2], estimatedMinutes: 60, requiresApproval: false },
        { stepOrder: 4, title: "Design visual assets", instructions: "Create graphics, images, and visual assets for each content piece. Follow brand guidelines. Optimize for each platform's dimensions. Create social media cards.", assigneeRole: "uxdesigner", dependsOn: [2], estimatedMinutes: 40, requiresApproval: false },
        { stepOrder: 5, title: "Review and approve", instructions: "Review all content and assets for quality, accuracy, brand alignment, and legal compliance. Check all links and CTAs work. Approve for publication or request revisions.", assigneeRole: "ceo", dependsOn: [3, 4], estimatedMinutes: 20, requiresApproval: true },
        { stepOrder: 6, title: "Publish and distribute", instructions: "Publish all content per the calendar schedule. Distribute across channels. Set up tracking UTMs. Schedule social media posts. Send email campaigns.", assigneeRole: "contentmarketer", dependsOn: [5], estimatedMinutes: 15, requiresApproval: false },
        { stepOrder: 7, title: "Track metrics and report", instructions: "After 7 days, compile performance metrics: views, engagement, conversions, leads generated. Compare against goals. Write a brief performance summary with recommendations.", assigneeRole: "contentmarketer", dependsOn: [6], estimatedMinutes: 15, requiresApproval: false },
      ],
    },
    {
      name: "Weekly Operations Review",
      description: "Compile team activity, metrics, and blockers into a weekly status report",
      body: "A recurring weekly workflow that synthesizes agent activity into an actionable status report. The CEO gathers daily notes, compiles metrics, and produces a stakeholder-ready summary.",
      icon: "clipboard-list",
      category: "operations",
      estimatedMinutes: 60,
      steps: [
        { stepOrder: 1, title: "Gather agent daily notes", instructions: "Read daily notes from all direct reports for the past 7 days. Note: completed tasks, decisions made, blockers encountered, and lessons learned. Flag anything that needs follow-up.", assigneeRole: "ceo", dependsOn: [], estimatedMinutes: 15, requiresApproval: false },
        { stepOrder: 2, title: "Compile metrics", instructions: "Gather key metrics: tasks completed, tasks in progress, budget spend, agent utilization, and any SLA breaches. Compare against last week. Highlight trends.", assigneeRole: "cto", dependsOn: [], estimatedMinutes: 10, requiresApproval: false },
        { stepOrder: 3, title: "Identify blockers and risks", instructions: "Review all open blockers across the team. Assess risks to current timelines. Prioritize by impact. Propose mitigation actions for each.", assigneeRole: "cto", dependsOn: [1, 2], estimatedMinutes: 10, requiresApproval: false },
        { stepOrder: 4, title: "Draft weekly status report", instructions: "Compile everything into a structured report: highlights (top 3 wins), metrics summary, active projects status, blockers & risks, and next week's priorities. Keep it under 2 pages.", assigneeRole: "ceo", dependsOn: [3], estimatedMinutes: 15, requiresApproval: false },
        { stepOrder: 5, title: "Distribute to stakeholders", instructions: "Publish the weekly report to the shared library. Send summary to relevant stakeholders. Schedule any follow-up meetings needed for blockers.", assigneeRole: "ceo", dependsOn: [4], estimatedMinutes: 10, requiresApproval: false },
      ],
    },
    {
      name: "Lead Generation Funnel",
      description: "Build and optimize a lead generation pipeline from research to qualified leads",
      body: "A structured approach to generating and qualifying leads. Covers market research, lead magnet creation, outreach sequences, qualification criteria, and pipeline handoff. Designed for B2B service companies.",
      icon: "funnel",
      category: "marketing",
      estimatedMinutes: 240,
      steps: [
        { stepOrder: 1, title: "Define ideal customer profile", instructions: "Research and document the ICP: industry, company size, pain points, budget range, decision-makers, and buying triggers. Create 2-3 buyer personas with specific characteristics.", assigneeRole: "ceo", dependsOn: [], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 2, title: "Create lead magnet", instructions: "Based on the ICP's pain points, create a valuable lead magnet: whitepaper, case study, tool, or guide. It must solve a real problem and demonstrate expertise. Include a clear CTA.", assigneeRole: "contentmarketer", dependsOn: [1], estimatedMinutes: 45, requiresApproval: false },
        { stepOrder: 3, title: "Build landing page", instructions: "Design and build a conversion-optimized landing page for the lead magnet. Include: headline matching the pain point, benefits (not features), social proof, and a simple form. A/B test headline variants.", assigneeRole: "uxdesigner", dependsOn: [2], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 4, title: "Design outreach sequences", instructions: "Create a 5-email nurture sequence for leads who download the magnet. Sequence: value-add → case study → pain agitation → solution overview → soft CTA for call. Also create a cold outreach sequence (3 touches).", assigneeRole: "contentmarketer", dependsOn: [1], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 5, title: "Set up tracking and scoring", instructions: "Define lead scoring criteria: engagement score (opens, clicks, page visits), fit score (matches ICP?), and intent signals. Set thresholds for MQL and SQL. Configure tracking.", assigneeRole: "cto", dependsOn: [3, 4], estimatedMinutes: 20, requiresApproval: false },
        { stepOrder: 6, title: "Launch and monitor", instructions: "Activate all campaigns. Monitor daily: traffic, conversion rates, email open/click rates, lead quality. Adjust targeting and messaging based on first 72 hours of data.", assigneeRole: "contentmarketer", dependsOn: [5], estimatedMinutes: 30, requiresApproval: false },
        { stepOrder: 7, title: "Qualify and hand off leads", instructions: "Review leads against qualification criteria. Categorize as MQL or SQL. For SQLs: create a brief with lead context, pain points, and recommended approach. Hand off to CEO for outreach.", assigneeRole: "contentmarketer", dependsOn: [6], estimatedMinutes: 20, requiresApproval: false },
        { stepOrder: 8, title: "Funnel performance review", instructions: "After 2 weeks, compile funnel metrics: visitors → leads → MQLs → SQLs → opportunities. Calculate conversion rates at each stage. Identify the weakest stage. Recommend optimizations.", assigneeRole: "ceo", dependsOn: [7], estimatedMinutes: 20, requiresApproval: true },
      ],
    },
  ];
}
