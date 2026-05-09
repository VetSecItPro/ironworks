/**
 * Unit tests for `uploadVaultToR2`. We mock `@aws-sdk/client-s3` so the test
 * runs offline and can introspect the constructor + command arguments - the
 * hot points where regressions hide:
 *   - S3Client constructed with region:"auto", forcePathStyle, and the
 *     endpoint/credentials passed through verbatim.
 *   - PutObjectCommand constructed with Bucket/Key/Body/ContentType matching
 *     the caller's args (no surprise transforms).
 *   - The return shape echoes ETag + sizeBytes.
 *
 * Mocks live in module scope (vitest hoists `vi.mock` above imports). The
 * mock factory captures the constructor + command args via `vi.fn()`, which
 * is cleaner than reaching into `S3Client.mock.calls` later.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const s3CtorSpy = vi.fn();
const putCmdCtorSpy = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: class MockS3Client {
      constructor(opts: unknown) {
        s3CtorSpy(opts);
      }
      // The real client returns a Promise; mirror that.
      send = (cmd: unknown) => sendMock(cmd);
    },
    PutObjectCommand: class MockPutObjectCommand {
      input: unknown;
      constructor(input: unknown) {
        putCmdCtorSpy(input);
        this.input = input;
      }
    },
  };
});

// Import AFTER vi.mock - vitest hoists `vi.mock` above imports already, so
// this is just stylistic clarity for readers.
import { uploadVaultToR2 } from "../uploader.js";

describe("uploadVaultToR2", () => {
  beforeEach(() => {
    sendMock.mockReset();
    s3CtorSpy.mockReset();
    putCmdCtorSpy.mockReset();
  });

  it("constructs S3Client with R2-friendly settings and PutObjectCommand with caller args", async () => {
    sendMock.mockResolvedValueOnce({ ETag: '"abc123"' });
    const body = Buffer.from("PKfake zip bytes");

    const result = await uploadVaultToR2({
      bucketName: "my-bucket",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      accessKeyId: "AKIA-EXAMPLE",
      secretAccessKey: "secret-xyz",
      key: "snapshots/2026-05-08/acme-vault.zip",
      body,
    });

    // S3Client constructed with the right shape - region forced to "auto"
    // (R2 ignores it but the SDK requires the field), forcePathStyle for
    // portable path-style URLs, and credentials passed through unchanged.
    expect(s3CtorSpy).toHaveBeenCalledTimes(1);
    expect(s3CtorSpy).toHaveBeenCalledWith({
      region: "auto",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "AKIA-EXAMPLE",
        secretAccessKey: "secret-xyz",
      },
      forcePathStyle: true,
    });

    // PutObjectCommand built with matching args. ContentType pinned to
    // application/zip so R2 dashboards display the file correctly.
    expect(putCmdCtorSpy).toHaveBeenCalledTimes(1);
    expect(putCmdCtorSpy).toHaveBeenCalledWith({
      Bucket: "my-bucket",
      Key: "snapshots/2026-05-08/acme-vault.zip",
      Body: body,
      ContentType: "application/zip",
    });

    expect(result).toEqual({ etag: '"abc123"', sizeBytes: body.length });
  });

  it("returns sizeBytes even when the provider omits ETag", async () => {
    sendMock.mockResolvedValueOnce({}); // no ETag in response
    const body = Buffer.from("body");

    const result = await uploadVaultToR2({
      bucketName: "b",
      endpoint: "https://x.example",
      accessKeyId: "k",
      secretAccessKey: "s",
      key: "k",
      body,
    });

    expect(result).toEqual({ etag: undefined, sizeBytes: 4 });
  });

  it("propagates upload errors so callers can record metrics + log", async () => {
    sendMock.mockRejectedValueOnce(new Error("403 Forbidden"));

    await expect(
      uploadVaultToR2({
        bucketName: "b",
        endpoint: "https://x.example",
        accessKeyId: "k",
        secretAccessKey: "s",
        key: "k",
        body: Buffer.from("x"),
      }),
    ).rejects.toThrow("403 Forbidden");
  });
});
