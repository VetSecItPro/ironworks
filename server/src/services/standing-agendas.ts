import { eq } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { agentChannels, companies } from "@ironworksai/db";
import { postStandingAgenda } from "./channels.js";
import { logger } from "../middleware/logger.js";

const ENGINEERING_AGENDA =
  "Standing agenda: Open PRs, blockers, velocity update. Team, please post your updates.";

const COMPANY_AGENDA =
  "Standing agenda: Weekly priorities review. Department heads, share your top priorities.";

/**
 * Post Monday standing agendas to #engineering and #company channels for all
 * active companies. Called by the CT-aware scheduler every Monday at 09:00 CT.
 */
export async function postStandingAgendas(db: Db): Promise<void> {
  const allCompanies = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.status, "active"));

  for (const company of allCompanies) {
    try {
      const channels = await db
        .select({ id: agentChannels.id, name: agentChannels.name, scopeType: agentChannels.scopeType })
        .from(agentChannels)
        .where(eq(agentChannels.companyId, company.id));

      for (const ch of channels) {
        if (ch.scopeType === "department" && ch.name === "engineering") {
          await postStandingAgenda(db, ch.id, company.id, ENGINEERING_AGENDA);
          logger.info({ companyId: company.id, channelId: ch.id }, "posted standing agenda to #engineering");
        }
        if (ch.scopeType === "company") {
          await postStandingAgenda(db, ch.id, company.id, COMPANY_AGENDA);
          logger.info({ companyId: company.id, channelId: ch.id }, "posted standing agenda to #company");
        }
      }
    } catch (err) {
      logger.warn({ err, companyId: company.id }, "standing agenda failed for company");
    }
  }
}
