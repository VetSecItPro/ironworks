import type { RenderedFile } from "./render-knowledge.js";

/**
 * Minimal Obsidian config files emitted at the vault root. `app.json`
 * forces Obsidian to honor the `[[wikilink]]` format that P1 emits (rather
 * than auto-converting to markdown links), and `community-plugins.json`
 * declares an empty plugin list so Obsidian doesn't prompt the user about
 * missing plugins on first open.
 *
 * Spec-fixed shapes - keep in lock-step with the design doc.
 */
const APP_JSON = {
  useMarkdownLinks: false,
  newLinkFormat: "shortest",
  alwaysUpdateLinks: true,
} as const;

/**
 * Return the two `.obsidian/*` config files. Pure (no DB / no I/O); caller
 * is expected to feed these straight into `archive.append`.
 */
export function getObsidianConfigFiles(): RenderedFile[] {
  return [
    {
      path: ".obsidian/app.json",
      // 2-space indent matches Obsidian's own write format and stays diffable
      // when a vault is checked into git.
      content: `${JSON.stringify(APP_JSON, null, 2)}\n`,
    },
    {
      path: ".obsidian/community-plugins.json",
      content: "[]\n",
    },
  ];
}
