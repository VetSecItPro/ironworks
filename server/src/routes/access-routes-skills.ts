import { Router } from "express";
import { notFound } from "../errors.js";
import { type AccessRouteContext, listAvailableSkills, readSkillMarkdown } from "./access-route-helpers.js";

export function accessSkillsRoutes(_ctx: AccessRouteContext): Router {
  const router = Router();

  router.get("/skills/available", (_req, res) => {
    res.json({ skills: listAvailableSkills() });
  });

  router.get("/skills/index", (_req, res) => {
    res.json({
      skills: [
        { name: "ironworks", path: "/api/skills/ironworks" },
        {
          name: "para-memory-files",
          path: "/api/skills/para-memory-files",
        },
        {
          name: "ironworks-create-agent",
          path: "/api/skills/ironworks-create-agent",
        },
      ],
    });
  });

  router.get("/skills/:skillName", (req, res) => {
    const skillName = (req.params.skillName as string).trim().toLowerCase();
    const markdown = readSkillMarkdown(skillName);
    if (!markdown) throw notFound("Skill not found");
    res.type("text/markdown").send(markdown);
  });

  return router;
}
