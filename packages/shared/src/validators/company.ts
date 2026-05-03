import { z } from "zod";
import { COMPANY_STATUSES } from "../constants.js";

const logoAssetIdSchema = z.string().uuid().nullable().optional();
const brandColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable()
  .optional();

export const createCompanySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  budgetMonthlyCents: z.number().int().nonnegative().optional().default(0),
});

export type CreateCompany = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial().extend({
  status: z.enum(COMPANY_STATUSES).optional(),
  spentMonthlyCents: z.number().int().nonnegative().optional(),
  requireBoardApprovalForNewAgents: z.boolean().optional(),
  brandColor: brandColorSchema,
  logoAssetId: logoAssetIdSchema,
  // SEC-PROMPT-001: per-company override for the instance prompt preamble.
  // null clears the override and re-enables the instance-level fallback.
  promptPreamble: z.string().max(4000).nullable().optional(),
});

export type UpdateCompany = z.infer<typeof updateCompanySchema>;

export const updateCompanyBrandingSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    brandColor: brandColorSchema,
    logoAssetId: logoAssetIdSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.brandColor !== undefined ||
      value.logoAssetId !== undefined,
    "At least one branding field must be provided",
  );

export type UpdateCompanyBranding = z.infer<typeof updateCompanyBrandingSchema>;

const onboardRosterItemSchema = z.object({
  templateKey: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  title: z.string().nullable().optional(),
  reportsTo: z.string().nullable().optional(),
  suggestedAdapter: z.string().nullable().optional(),
  skills: z.array(z.string()).optional(),
});

const onboardExtraTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
});

// Single payload for the wizard's Launch button. The server runs every create
// inside one orchestrator and rolls back the company (and all child rows) on
// any failure, so the client can never end up with half-built state. See
// POST /companies/onboard handler.
export const onboardCompanySchema = z
  .object({
    companyName: z.string().min(1),
    companyGoal: z.string().optional().default(""),
    llmProvider: z.string().min(1),
    llmAuthMode: z.enum(["api_key", "subscription"]),
    llmApiKey: z.string().optional().default(""),
    llmSecretName: z.string().min(1),
    step2Mode: z.enum(["pack", "manual"]),
    rosterItems: z.array(onboardRosterItemSchema).optional().default([]),
    agentName: z.string().optional().default(""),
    adapterType: z.string().min(1),
    adapterConfig: z.record(z.string(), z.unknown()).optional().default({}),
    primaryTask: z
      .object({
        title: z.string().optional().default(""),
        description: z.string().optional().default(""),
      })
      .optional(),
    extraTasks: z.array(onboardExtraTaskSchema).optional().default([]),
  })
  .superRefine((value, ctx) => {
    if (value.step2Mode === "pack" && value.rosterItems.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rosterItems"],
        message: "rosterItems required for pack mode",
      });
    }
    if (value.step2Mode === "manual" && !value.agentName.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agentName"],
        message: "agentName required for manual mode",
      });
    }
  });

export type OnboardCompany = z.infer<typeof onboardCompanySchema>;
