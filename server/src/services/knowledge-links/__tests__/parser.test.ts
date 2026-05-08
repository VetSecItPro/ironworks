import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../../middleware/logger.js";
import { extractWikilinks, WIKILINK_CAP } from "../parser.js";

describe("extractWikilinks", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("parses a plain [[slug]]", () => {
    expect(extractWikilinks("see [[alpha]] please")).toEqual([{ slug: "alpha", anchor: null }]);
  });

  it("parses [[slug#anchor]] with anchor", () => {
    expect(extractWikilinks("[[alpha#intro]]")).toEqual([{ slug: "alpha", anchor: "intro" }]);
  });

  it("treats trailing [[slug#]] as null anchor", () => {
    expect(extractWikilinks("[[alpha#]]")).toEqual([{ slug: "alpha", anchor: null }]);
  });

  it("ignores empty [[]]", () => {
    expect(extractWikilinks("nothing [[]] here")).toEqual([]);
  });

  it("trims whitespace inside [[ slug ]]", () => {
    expect(extractWikilinks("[[  alpha  ]]")).toEqual([{ slug: "alpha", anchor: null }]);
  });

  it("ignores [[slug with spaces]] (no internal whitespace)", () => {
    expect(extractWikilinks("[[slug with spaces]]")).toEqual([]);
  });

  it("accepts folder-prefix slugs [[engineering/api-conventions]]", () => {
    expect(extractWikilinks("[[engineering/api-conventions]]")).toEqual([
      { slug: "engineering/api-conventions", anchor: null },
    ]);
  });

  it("accepts multi-segment slug + anchor", () => {
    expect(extractWikilinks("[[engineering/error-handling#5xx-retries]]")).toEqual([
      { slug: "engineering/error-handling", anchor: "5xx-retries" },
    ]);
  });

  it("deduplicates identical (slug, anchor) tuples preserving first-occurrence order", () => {
    expect(extractWikilinks("[[alpha]] then [[beta]] then [[alpha]]")).toEqual([
      { slug: "alpha", anchor: null },
      { slug: "beta", anchor: null },
    ]);
  });

  it("treats same slug different anchor as separate entries", () => {
    expect(extractWikilinks("[[alpha#a]] [[alpha#b]]")).toEqual([
      { slug: "alpha", anchor: "a" },
      { slug: "alpha", anchor: "b" },
    ]);
  });

  it("ignores wikilinks inside fenced code blocks", () => {
    const body = "before\n```\n[[skip-me]]\n```\nafter";
    expect(extractWikilinks(body)).toEqual([]);
  });

  it("ignores wikilinks inside inline backticks", () => {
    expect(extractWikilinks("here `[[skip-me]]` and done")).toEqual([]);
  });

  it("mixes real link before fence + ignored link inside fence", () => {
    const body = "[[real-one]]\n```\n[[skip-me]]\n```\n";
    expect(extractWikilinks(body)).toEqual([{ slug: "real-one", anchor: null }]);
  });

  it("respects fence with info string", () => {
    const body = "```ts\n[[skip-me]]\n```\n[[real]]";
    expect(extractWikilinks(body)).toEqual([{ slug: "real", anchor: null }]);
  });

  it("caps at 200 unique links and logs a single warning", () => {
    const links: string[] = [];
    for (let i = 0; i < 250; i++) links.push(`[[slug-${i}]]`);
    const result = extractWikilinks(links.join(" "));
    expect(result).toHaveLength(WIKILINK_CAP);
    expect(result[0]).toEqual({ slug: "slug-0", anchor: null });
    expect(result[WIKILINK_CAP - 1]).toEqual({
      slug: `slug-${WIKILINK_CAP - 1}`,
      anchor: null,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns self-link [[my-own-slug]] (resolver decides what to do)", () => {
    expect(extractWikilinks("[[my-own-slug]]")).toEqual([{ slug: "my-own-slug", anchor: null }]);
  });

  it("ignores broken brackets gracefully", () => {
    expect(extractWikilinks("[single] [[unclosed and ]]nope[[")).toEqual([]);
  });

  it("parses inner link of nested [[outer[[inner]]]] and ignores outer", () => {
    // Documented choice: regex is non-greedy + slug pattern excludes brackets,
    // so we capture `inner` and the outer broken pair is dropped.
    expect(extractWikilinks("[[outer[[inner]]]]")).toEqual([{ slug: "inner", anchor: null }]);
  });

  it("rejects ambiguous multi-hash anchors", () => {
    expect(extractWikilinks("[[alpha#a#b]]")).toEqual([]);
  });

  it("rejects empty slug with anchor [[#anchor]]", () => {
    expect(extractWikilinks("[[#anchor]]")).toEqual([]);
  });

  it("returns [] on empty body", () => {
    expect(extractWikilinks("")).toEqual([]);
  });

  it("does not call logger.warn under cap", () => {
    extractWikilinks("[[a]] [[b]] [[c]]");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
