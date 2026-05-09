/**
 * S3-compatible uploader for the scheduled vault-snapshot cron (P3.2).
 *
 * Targets Cloudflare R2 by default but works against any S3-API-compatible
 * provider (Backblaze B2, Wasabi, MinIO) - the caller supplies the endpoint
 * URL. Buffered upload for v1: vault zips are typically KB-to-MB scale; the
 * cost of holding the whole archive in memory is negligible vs. the
 * complexity of multipart upload coordination. Multipart upload is deferred
 * until we observe a vault that pushes us past the buffered limit.
 *
 * `region: "auto"` because R2 ignores it but `S3Client` requires the field.
 * `forcePathStyle: true` because path-style URLs are the most portable
 * across S3-compatible backends (R2 supports both, Wasabi/B2 path-style).
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface UploadArgs {
  bucketName: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Full S3 object key, including any `keyPrefix/` segment. */
  key: string;
  /** The complete vault zip bytes. */
  body: Buffer;
}

export interface UploadResult {
  /** ETag returned by the storage backend (undefined if the provider omits it). */
  etag: string | undefined;
  /** Convenience echo of the body length so callers don't recompute it for logs/metrics. */
  sizeBytes: number;
}

export async function uploadVaultToR2(args: UploadArgs): Promise<UploadResult> {
  const client = new S3Client({
    region: "auto",
    endpoint: args.endpoint,
    credentials: {
      accessKeyId: args.accessKeyId,
      secretAccessKey: args.secretAccessKey,
    },
    forcePathStyle: true,
  });
  const result = await client.send(
    new PutObjectCommand({
      Bucket: args.bucketName,
      Key: args.key,
      Body: args.body,
      ContentType: "application/zip",
    }),
  );
  return { etag: result.ETag, sizeBytes: args.body.length };
}
