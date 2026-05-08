import yaml from "js-yaml";
import type { AnyFrontmatter } from "./index.js";

/**
 * Render a Frontmatter object as a YAML block wrapped in `---` delimiters,
 * suitable for prepending to a markdown body. Trailing newline included so
 * concatenation with body text produces valid markdown.
 *
 * Why we omit `undefined` keys: js-yaml emits `key: null` for `undefined`
 * which round-trips back as `null`, not `undefined`. Frontmatter optional
 * fields are absent when unset, not null — keeps the round-trip lossless
 * for `BaseFrontmatter | undefined`-style optional properties.
 */
export function renderFrontmatter(fm: AnyFrontmatter): string {
  const cleaned = stripUndefined(fm);
  const body = yaml.dump(cleaned, {
    // lineWidth: -1 prevents js-yaml from wrapping long strings, which would
    // otherwise corrupt single-line values that contain spaces.
    lineWidth: -1,
    // noRefs: avoids `&anchor` / `*alias` markers — frontmatter has no shared refs.
    noRefs: true,
    // sortKeys: stable ordering so two equivalent objects always emit the
    // same YAML (helps tests + git diff readability).
    sortKeys: true,
  });
  return `---\n${body}---\n`;
}

function stripUndefined(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
