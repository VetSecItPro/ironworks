import type { Db } from "@ironworksai/db";
// archiver v8 is pure ESM and exports format-specific classes
// (ZipArchive, TarArchive, JsonArchive) - no factory function. The shipped
// `@types/archiver` package still types the legacy `archiver(format, opts)`
// CJS factory, so we type-only-import the runtime `Archiver` interface
// from there and pull the actual constructor via a namespace import.
import type archiverNs from "archiver";
import * as archiverModule from "archiver";
import type { Response } from "express";

interface ZipArchiveCtor {
  new (options?: archiverNs.ArchiverOptions): archiverNs.Archiver;
}

// The runtime export shape (`{ ZipArchive, Archiver, ... }`) is not in the
// type definitions, so reach for it through a narrowly-typed cast. Pinning
// it at module load fails fast if archiver ever drops the named export.
const ZipArchive = (archiverModule as unknown as { ZipArchive: ZipArchiveCtor }).ZipArchive;

import { logger } from "../../middleware/logger.js";
import { composeVault } from "./composer.js";
import type { IndexCounts } from "./render-index.js";

export type { IndexCounts } from "./render-index.js";

export interface StreamVaultExportDeps {
  db: Db;
}

export interface StreamVaultExportArgs {
  companyId: string;
  companyName: string;
  res: Response;
  /** Override the wall clock used for both the filename date and the index
   *  page's `generated_at`. Tests pin this for deterministic output. */
  now?: () => Date;
}

/**
 * Zip compression level. 6 is the zlib default - strong size reduction
 * without the per-byte cost of 9, important here because we stream
 * potentially gigabyte-scale archives over a single HTTP connection.
 */
const ZIP_COMPRESSION_LEVEL = 6;

/**
 * Stream a complete vault export to the HTTP response.
 *
 * Sets `Content-Type` + `Content-Disposition` headers, creates an archiver
 * instance piped into `res`, runs the composer to enqueue every entity,
 * and finalizes the archive. Resolves once the archive has flushed all
 * bytes to the response.
 *
 * Composer errors are caught and logged; on failure we still call
 * `archive.finalize()` (or `abort()`) so the HTTP response doesn't dangle.
 * The route layer should typically `await` this and let any thrown error
 * propagate to the global error handler - but headers will already be
 * flushed, so the only honest signal is to drop the connection.
 */
export async function streamVaultExport(
  deps: StreamVaultExportDeps,
  args: StreamVaultExportArgs,
): Promise<IndexCounts> {
  const { companyId, companyName, res } = args;
  const now = args.now ?? (() => new Date());
  const safeFilename = sanitizeFilenameBase(companyName);
  const datePart = now().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}-vault-${datePart}.zip"`);

  const archive = new ZipArchive({ zlib: { level: ZIP_COMPRESSION_LEVEL } });

  // Archiver emits two failure events: `error` (fatal - propagate up) and
  // `warning` (recoverable, e.g. ENOENT on an entry stream). We log both
  // but only treat the former as fatal so a single bad entry doesn't kill
  // a 10K-page export.
  archive.on("error", (err) => {
    logger.error({ err, companyId }, "vault-export archiver error");
  });
  archive.on("warning", (err) => {
    if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.warn({ err, companyId }, "vault-export archiver warning");
    } else {
      logger.error({ err, companyId }, "vault-export archiver warning (non-ENOENT)");
    }
  });

  archive.pipe(res);

  try {
    const counts = await composeVault(deps, { companyId, companyName, archive, now });
    await archive.finalize();
    return counts;
  } catch (err) {
    logger.error({ err, companyId }, "vault-export composer failed mid-stream");
    // Best-effort cleanup: archiver exposes `abort()` which closes the
    // underlying stream without writing the central directory. The client
    // sees a truncated zip - there's no honest recovery once headers have
    // been flushed.
    try {
      archive.abort();
    } catch (abortErr) {
      logger.error({ err: abortErr, companyId }, "vault-export archive abort failed");
    }
    throw err;
  }
}

/**
 * Filesystem-safe filename base derived from the company name. Lower-case,
 * collapse non-`[a-z0-9-]` to `-`, trim edges. Empty result falls back to
 * "company" so the Content-Disposition header is always well-formed.
 */
function sanitizeFilenameBase(companyName: string): string {
  const cleaned = companyName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "company";
}
