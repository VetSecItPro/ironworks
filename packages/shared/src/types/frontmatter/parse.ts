import yaml from "js-yaml";
import type { AnyFrontmatter } from "./index.js";

/**
 * Match a YAML frontmatter block at the very start of a document.
 *   - Opens with `---` on its own line (LF or CRLF).
 *   - Closes with `---` on its own line.
 *   - Captures the YAML body in group 1 and the remainder in group 2.
 *
 * Anchored to start-of-string only: a `---` later in the body never
 * triggers a partial parse.
 */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a markdown document into its frontmatter object + body.
 *
 * Returns `{ fm: undefined, body }` for:
 *   - Documents without a `---` block (body is the full input)
 *   - Documents whose `---` block contains malformed YAML (body is the
 *     full input — caller can decide whether to re-parse, log, or skip)
 *   - Documents whose `---` block parses to a non-object scalar (e.g.
 *     `---\nhello\n---`); frontmatter must be a mapping
 *
 * The generic parameter narrows the return type; the function does NOT
 * runtime-validate the shape against `T`. That's the caller's job (or a
 * future Zod validator step). Keeping the parser permissive matches the
 * spec's "Frontmatter parse on legacy MD without YAML header" edge case.
 */
export function parseFrontmatter<T extends AnyFrontmatter = AnyFrontmatter>(
  md: string,
): { fm: T | undefined; body: string } {
  const match = FRONTMATTER_RE.exec(md);
  if (!match) {
    return { fm: undefined, body: md };
  }

  const [, yamlBody, rest] = match;
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlBody);
  } catch {
    // Malformed YAML — degrade gracefully, hand the caller the raw doc.
    return { fm: undefined, body: md };
  }

  // Frontmatter must be a mapping (object). Scalars / arrays / null fall back
  // to "no frontmatter" — this preserves the body as-is for downstream tools.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { fm: undefined, body: md };
  }

  return { fm: parsed as T, body: rest };
}
