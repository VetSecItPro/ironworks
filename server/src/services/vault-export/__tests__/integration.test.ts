/**
 * Integration test for `streamVaultExport`. Confirms:
 *   - Content-Type / Content-Disposition headers are correctly set
 *   - The composer runs to completion against a real DB
 *   - The archive flushes bytes and finalizes (Promise resolves)
 *   - The captured byte stream starts with the standard zip local-file
 *     header (`PK\x03\x04`), proving a real archive structure was produced
 *
 * We deliberately do NOT extract the zip here - composer-level entry
 * assertions live in `composer.test.ts` against a recording archive. The
 * goal of this file is to verify the streaming-glue layer (headers + pipe
 * + finalize) works end-to-end without re-asserting composer behavior.
 */

import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import {
  agents,
  companies,
  companySkills,
  createDb,
  getEmbeddedPostgresTestSupport,
  issueComments,
  issues,
  knowledgePages,
  startEmbeddedPostgresTestDatabase,
} from "@ironworksai/db";
import type { Response } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { streamVaultExport } from "../index.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping vault-export integration test: ${support.reason ?? "unsupported"}`);
}

/**
 * Build a thin Response stand-in: extends node's PassThrough so archiver
 * can pipe into it, and adds the headers Map + setHeader method that
 * `streamVaultExport` writes through. Anything else in the Express
 * Response surface goes unused - we cast to `Response` once at the seam.
 */
function makeFakeResponse(): {
  res: Response;
  headers: Map<string, string>;
  bodyChunks: Buffer[];
  collected: Promise<Buffer>;
} {
  const stream = new PassThrough();
  const bodyChunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => bodyChunks.push(chunk));
  const collected = new Promise<Buffer>((resolve, reject) => {
    stream.on("end", () => resolve(Buffer.concat(bodyChunks)));
    stream.on("error", reject);
  });

  const headers = new Map<string, string>();
  // We extend the PassThrough with `setHeader`, the only Response method
  // `streamVaultExport` touches before piping. The stream itself satisfies
  // archiver's `pipe` contract.
  const setHeader = (name: string, value: number | string | readonly string[]): unknown => {
    headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
    return undefined;
  };
  const res = Object.assign(stream, { setHeader }) as unknown as Response;

  return { res, headers, bodyChunks, collected };
}

describeIfSupported("streamVaultExport (integration)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-vault-stream-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Stream Test Co" });
  }, 120_000);

  afterEach(async () => {
    await db.delete(issueComments);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companySkills);
    await db.delete(knowledgePages);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("sets headers, streams bytes, and finalizes the archive", async () => {
    // A handful of seed rows so the archive has real content. Empty-vault
    // case is covered separately; here we want a non-trivial byte stream.
    await db.insert(knowledgePages).values([
      { id: randomUUID(), companyId, slug: "decisions/d-1", title: "D1", body: "decided" },
      { id: randomUUID(), companyId, slug: "engineering/conv", title: "Conv", body: "stuff" },
    ]);
    await db.insert(agents).values({ id: randomUUID(), companyId, name: "Solo Bot" });

    const { res, headers, collected } = makeFakeResponse();

    const counts = await streamVaultExport(
      { db },
      {
        companyId,
        companyName: "Stream Test Co",
        res,
        now: () => new Date("2026-05-08T00:00:00Z"),
      },
    );

    expect(counts).toEqual({
      knowledgePages: 2,
      decisions: 1,
      agents: 1,
      issues: 0,
      skills: 0,
    });

    expect(headers.get("Content-Type")).toBe("application/zip");
    expect(headers.get("Content-Disposition")).toBe('attachment; filename="stream-test-co-vault-2026-05-08.zip"');

    const bytes = await collected;
    expect(bytes.length).toBeGreaterThan(0);
    // Zip local-file header magic: PK\x03\x04. Confirms archiver actually
    // produced a real archive (vs. an empty buffer or text dump).
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }, 30_000);

  it("sanitizes weird company names in the filename", async () => {
    const { res, headers, collected } = makeFakeResponse();

    await streamVaultExport(
      { db },
      {
        companyId,
        companyName: "Acme :: Holdings, Inc!",
        res,
        now: () => new Date("2026-05-08T00:00:00Z"),
      },
    );

    expect(headers.get("Content-Disposition")).toBe('attachment; filename="acme-holdings-inc-vault-2026-05-08.zip"');
    // Drain the response so the test doesn't leave a hanging stream.
    await collected;
  }, 30_000);
});
