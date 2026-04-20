import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  buildAttachmentBlock,
  DEFAULT_MAX_FILE_BYTES,
  type FileRef,
  validateFilePayload,
} from "../files-api.js";

describe("validateFilePayload", () => {
  it("accepts PNG image under size cap", () => {
    const result = validateFilePayload({
      filename: "test.png",
      mimeType: "image/png",
      bytes: new Uint8Array(1024),
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts JPEG image", () => {
    const result = validateFilePayload({
      filename: "test.jpg",
      mimeType: "image/jpeg",
      bytes: new Uint8Array(1024),
    });
    expect(result.valid).toBe(true);
  });

  it("accepts PDF", () => {
    const result = validateFilePayload({
      filename: "doc.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array(1024),
    });
    expect(result.valid).toBe(true);
  });

  it("rejects executable MIME types", () => {
    const result = validateFilePayload({
      filename: "evil.exe",
      mimeType: "application/x-msdownload",
      bytes: new Uint8Array(1024),
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/mime/i);
  });

  it("rejects empty bytes", () => {
    const result = validateFilePayload({
      filename: "empty.png",
      mimeType: "image/png",
      bytes: new Uint8Array(0),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /empty|zero/i.test(e))).toBe(true);
  });

  it("rejects oversized file (>default 20MB)", () => {
    const result = validateFilePayload({
      filename: "huge.png",
      mimeType: "image/png",
      bytes: new Uint8Array(25 * 1024 * 1024),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /size|large/i.test(e))).toBe(true);
  });

  it("respects custom maxBytes override", () => {
    const result = validateFilePayload(
      {
        filename: "small.png",
        mimeType: "image/png",
        bytes: new Uint8Array(2 * 1024 * 1024),
      },
      { maxBytes: 1 * 1024 * 1024 },
    );
    expect(result.valid).toBe(false);
  });

  it("rejects empty filename", () => {
    const result = validateFilePayload({
      filename: "",
      mimeType: "image/png",
      bytes: new Uint8Array(1024),
    });
    expect(result.valid).toBe(false);
  });

  it("rejects filenames with path traversal attempts", () => {
    const result = validateFilePayload({
      filename: "../../../etc/passwd",
      mimeType: "image/png",
      bytes: new Uint8Array(1024),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /filename|path/i.test(e))).toBe(true);
  });

  it("ALLOWED_MIME_TYPES contains expected image + document types", () => {
    expect(ALLOWED_MIME_TYPES).toContain("image/png");
    expect(ALLOWED_MIME_TYPES).toContain("image/jpeg");
    expect(ALLOWED_MIME_TYPES).toContain("image/webp");
    expect(ALLOWED_MIME_TYPES).toContain("image/gif");
    expect(ALLOWED_MIME_TYPES).toContain("application/pdf");
  });

  it("DEFAULT_MAX_FILE_BYTES is 20MB", () => {
    expect(DEFAULT_MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe("validateFilePayload — security hardening", () => {
  it("rejects backslash path traversal (Windows)", () => {
    const r = validateFilePayload({
      filename: "..\\..\\etc\\passwd",
      mimeType: "image/png",
      bytes: new Uint8Array(100),
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /path|traversal/i.test(e))).toBe(true);
  });

  it("rejects null bytes in filename", () => {
    const r = validateFilePayload({
      filename: "evil\x00.png",
      mimeType: "image/png",
      bytes: new Uint8Array(100),
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /null|line/i.test(e))).toBe(true);
  });

  it("rejects CR/LF in filename (log injection)", () => {
    const r1 = validateFilePayload({
      filename: "evil\rfoo.png",
      mimeType: "image/png",
      bytes: new Uint8Array(100),
    });
    const r2 = validateFilePayload({
      filename: "evil\nfoo.png",
      mimeType: "image/png",
      bytes: new Uint8Array(100),
    });
    expect(r1.valid).toBe(false);
    expect(r2.valid).toBe(false);
  });

  it("caps filename length at 255 chars", () => {
    const r = validateFilePayload({
      filename: `${"a".repeat(256)}.png`,
      mimeType: "image/png",
      bytes: new Uint8Array(100),
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /255|length/i.test(e))).toBe(true);
  });

  it("accepts filename exactly 255 chars", () => {
    const r = validateFilePayload({
      filename: `${"a".repeat(251)}.png`,
      mimeType: "image/png",
      bytes: new Uint8Array(100),
    });
    expect(r.valid).toBe(true);
  });
});

describe("buildAttachmentBlock", () => {
  const fileRef: FileRef = {
    provider: "anthropic",
    fileId: "file_abc123",
    mimeType: "image/png",
    filename: "test.png",
  };

  it("builds Anthropic content block for an image", () => {
    const block = buildAttachmentBlock(fileRef, { format: "anthropic" });
    // Anthropic: {type:'image', source:{type:'file', file_id:'file_abc123'}}
    expect(block).toEqual({
      type: "image",
      source: { type: "file", file_id: "file_abc123" },
    });
  });

  it("builds Anthropic content block for a PDF (document type)", () => {
    const pdf = { ...fileRef, mimeType: "application/pdf" };
    const block = buildAttachmentBlock(pdf, { format: "anthropic" });
    expect(block).toEqual({
      type: "document",
      source: { type: "file", file_id: "file_abc123" },
    });
  });

  it("builds OpenAI content block for an image with fileId → file:// URL", () => {
    const openaiRef: FileRef = { ...fileRef, provider: "openai" };
    const block = buildAttachmentBlock(openaiRef, { format: "openai" });
    expect(block).toEqual({
      type: "image_url",
      image_url: { url: "file://file_abc123" },
    });
  });

  it("builds OpenAI content block for an image with base64Data → data: URL", () => {
    const base64 = Buffer.from("test png bytes").toString("base64");
    const openaiInlineRef: FileRef = {
      provider: "openai",
      fileId: "",
      mimeType: "image/png",
      filename: "test.png",
      base64Data: base64,
    };
    const block = buildAttachmentBlock(openaiInlineRef, { format: "openai" });
    expect(block).toEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${base64}` },
    });
  });

  it("inline base64 mode for Anthropic (when fileId is absent)", () => {
    const base64 = Buffer.from("test png bytes").toString("base64");
    const inlineRef: FileRef = {
      provider: "anthropic",
      fileId: "", // empty — indicates inline
      mimeType: "image/png",
      filename: "test.png",
      base64Data: base64,
    };
    const block = buildAttachmentBlock(inlineRef, { format: "anthropic" });
    // Expected: {type:'image', source:{type:'base64', media_type:'image/png', data:'<base64>'}}
    expect(block).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: base64 },
    });
  });

  it("throws when no fileId and no base64Data (Anthropic)", () => {
    const noDataRef: FileRef = {
      provider: "anthropic",
      fileId: "",
      mimeType: "image/png",
      filename: "test.png",
      // base64Data intentionally absent
    };
    expect(() => buildAttachmentBlock(noDataRef, { format: "anthropic" })).toThrow();
  });

  it("throws when no fileId and no base64Data (OpenAI)", () => {
    const noDataRef: FileRef = {
      provider: "openai",
      fileId: "",
      mimeType: "image/png",
      filename: "test.png",
      // base64Data intentionally absent
    };
    expect(() => buildAttachmentBlock(noDataRef, { format: "openai" })).toThrow();
  });

  it("throws on mismatched provider/format", () => {
    const openaiRef: FileRef = { ...fileRef, provider: "openai" };
    expect(() => buildAttachmentBlock(openaiRef, { format: "anthropic" })).toThrow(/provider/i);
  });
});

describe("buildAttachmentBlock — base64 validation", () => {
  it("rejects malformed base64 (non-base64 chars)", () => {
    const ref: FileRef = {
      provider: "anthropic",
      fileId: "",
      mimeType: "image/png",
      filename: "x.png",
      base64Data: "not base64!!!",
    };
    expect(() => buildAttachmentBlock(ref, { format: "anthropic" })).toThrow(/base64/i);
  });

  it("rejects base64 with length not a multiple of 4", () => {
    const validRef: FileRef = {
      provider: "anthropic",
      fileId: "",
      mimeType: "image/png",
      filename: "x.png",
      base64Data: "YWJj", // valid: "abc" → length 4
    };
    expect(() => buildAttachmentBlock(validRef, { format: "anthropic" })).not.toThrow();

    const badRef: FileRef = { ...validRef, base64Data: "YWJ" }; // length 3 — not multiple of 4
    expect(() => buildAttachmentBlock(badRef, { format: "anthropic" })).toThrow(/base64|length/i);
  });

  it("accepts well-formed base64 with padding", () => {
    const ref: FileRef = {
      provider: "anthropic",
      fileId: "",
      mimeType: "image/png",
      filename: "x.png",
      base64Data: "YWI=", // valid: "ab" → length 4 with one pad char
    };
    expect(() => buildAttachmentBlock(ref, { format: "anthropic" })).not.toThrow();
  });

  it("rejects malformed base64 in OpenAI path too", () => {
    const ref: FileRef = {
      provider: "openai",
      fileId: "",
      mimeType: "image/png",
      filename: "x.png",
      base64Data: "bad!!!data",
    };
    expect(() => buildAttachmentBlock(ref, { format: "openai" })).toThrow(/base64/i);
  });
});
