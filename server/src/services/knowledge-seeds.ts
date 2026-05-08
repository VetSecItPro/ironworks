export type KnowledgeSeed = { title: string; body: string };

import { agentsSeeds } from "./knowledge-seeds-agents.js";
import { complianceSeeds } from "./knowledge-seeds-compliance.js";
import { engineeringSeeds } from "./knowledge-seeds-engineering.js";
import { financeSeeds } from "./knowledge-seeds-finance.js";
import { operatingSeeds } from "./knowledge-seeds-operating.js";
import { peopleSeeds } from "./knowledge-seeds-people.js";
import { sopSeeds } from "./knowledge-seeds-sops.js";
import { strategySeeds } from "./knowledge-seeds-strategy.js";

export function getKnowledgeSeeds(): {
  seeds: KnowledgeSeed[];
  sopTemplates: KnowledgeSeed[];
} {
  return {
    seeds: [
      ...operatingSeeds,
      ...strategySeeds,
      ...peopleSeeds,
      ...engineeringSeeds,
      ...agentsSeeds,
      ...complianceSeeds,
      ...financeSeeds,
    ],
    sopTemplates: sopSeeds,
  };
}
