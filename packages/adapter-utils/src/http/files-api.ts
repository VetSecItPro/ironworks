/**
 * Provider-neutral Files API utilities: validation, FileRef pointer, and message
 * content-block construction for vision / document / PDF attachments.
 *
 * Actual HTTP multipart uploads live in per-provider adapters (Phases C/D/E) where
 * provider-specific auth headers and beta flags belong. This module is the shared
 * validation + content-block shaping surface those adapters import.
 */

/** MIME types accepted for upload. Restrictive by default — adapters may pass custom lists. */
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
] as const;

/** 20 MB — Anthropic and OpenAI both cap single-file uploads at or below this. */
export const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export type FileProvider = "anthropic" | "openai" | "poe" | "openrouter";

/** Raw file data before upload — passed to validateFilePayload before any network call. */
export interface FilePayload {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Provider-returned reference to an uploaded file, or an inline base64 payload
 * when the provider doesn't support a Files API (or for small attachments that
 * don't warrant a separate upload round-trip).
 */
export interface FileRef {
  provider: FileProvider;
  /**
   * Provider-assigned file ID after upload. Empty string signals inline base64 mode —
   * `base64Data` must then be set. Keeping it as a string (not undefined) keeps
   * discriminated-union checks simpler for callers.
   */
  fileId: string;
  mimeType: string;
  filename: string;
  /** Present when using inline base64 encoding instead of Files API upload. */
  base64Data?: string;
}

/** Full list of errors so callers can surface everything at once rather than one-at-a-time. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidateOptions {
  maxBytes?: number;
  /** Override the default ALLOWED_MIME_TYPES allowlist. */
  allowedMimeTypes?: readonly string[];
}

/**
 * Validate a FilePayload against size, MIME, and filename safety rules.
 *
 * Returns all errors found — not just the first — so callers can display a
 * complete list without re-validating.
 */
export function validateFilePayload(payload: FilePayload, options: ValidateOptions = {}): ValidationResult {
  const errors: string[] = [];
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FILE_BYTES;
  const allowed: readonly string[] = options.allowedMimeTypes ?? ALLOWED_MIME_TYPES;

  if (!payload.filename || payload.filename.trim() === "") {
    errors.push("filename must be non-empty");
  } else {
    // Reject path-traversal sequences (POSIX + Windows separators + parent-dir reference).
    // Filenames are logged and surfaced in audit trails — a traversal sequence like
    // ..\..\etc\passwd can reach storage paths on Windows hosts.
    if (payload.filename.includes("..") || payload.filename.includes("/") || payload.filename.includes("\\")) {
      errors.push("filename must not contain path separators or traversal sequences");
    }
    // Reject control characters that enable log injection or C-string truncation.
    // NUL (\x00) terminates strings in C contexts and corrupts audit log entries;
    // CR/LF (\r\n) let attackers smuggle fake log lines after the real entry.
    if (/[\x00\r\n]/.test(payload.filename)) {
      errors.push("filename must not contain null bytes, carriage returns, or line feeds");
    }
    // Cap at POSIX filename limit — unbounded lengths cause storage driver issues
    // and silent display truncation in downstream audit UIs.
    if (payload.filename.length > 255) {
      errors.push("filename exceeds 255 characters (POSIX max)");
    }
  }

  if (!allowed.includes(payload.mimeType)) {
    errors.push(`mime type not allowed: ${payload.mimeType}`);
  }

  if (payload.bytes.length === 0) {
    errors.push("file bytes must not be empty (zero-byte file)");
  } else if (payload.bytes.length > maxBytes) {
    errors.push(`file size ${payload.bytes.length} exceeds max ${maxBytes} (file too large)`);
  }

  return { valid: errors.length === 0, errors };
}

export type AttachmentFormat = "anthropic" | "openai";

/**
 * Strict base64 alphabet + padding check.
 * Length must be a multiple of 4; only A-Z a-z 0-9 + / and up to two trailing = are valid.
 * Catches malformed payloads before they reach provider APIs where errors surface remotely
 * and are harder to attribute to the encoding step.
 */
// Groups of 4 base64 chars, last group may use 0-2 padding chars.
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;

function validateBase64(data: string): void {
  if (data.length === 0) {
    throw new Error("base64Data must not be empty");
  }
  // RFC 4648 §4: every base64-encoded stream's byte count is a multiple of 4.
  if (data.length % 4 !== 0) {
    throw new Error("base64Data length is not a multiple of 4");
  }
  if (!BASE64_REGEX.test(data)) {
    throw new Error("base64Data contains characters outside the base64 alphabet");
  }
}

export interface AttachmentBlockOptions {
  format: AttachmentFormat;
}

/**
 * Build a provider-native message content block that references the given FileRef.
 *
 * Throws when ref.provider and options.format disagree — catching cross-provider
 * shape mistakes at call time rather than letting malformed blocks reach the wire.
 *
 * Anthropic shapes:
 *   - image (Files API): {type:'image', source:{type:'file', file_id}}
 *   - image (inline):    {type:'image', source:{type:'base64', media_type, data}}
 *   - PDF  (Files API):  {type:'document', source:{type:'file', file_id}}
 *   - PDF  (inline):     {type:'document', source:{type:'base64', media_type, data}}
 *
 * OpenAI shapes (vision / chat completions):
 *   - image (Files API): {type:'image_url', image_url:{url:'file://<id>'}}
 *   - image (inline):    {type:'image_url', image_url:{url:'data:<mime>;base64,<data>'}}
 */
export function buildAttachmentBlock(ref: FileRef, options: AttachmentBlockOptions): Record<string, unknown> {
  if (ref.provider !== options.format) {
    throw new Error(`provider/format mismatch: ref.provider="${ref.provider}" but format="${options.format}"`);
  }

  if (options.format === "anthropic") {
    const blockType = ref.mimeType === "application/pdf" ? "document" : "image";

    if (ref.fileId !== "") {
      return {
        type: blockType,
        source: { type: "file", file_id: ref.fileId },
      };
    }

    if (ref.base64Data !== undefined && ref.base64Data !== "") {
      // Validate before passing to the API — malformed base64 errors surface remotely
      // and are hard to attribute; catch them at the construction site instead.
      validateBase64(ref.base64Data);
      return {
        type: blockType,
        source: { type: "base64", media_type: ref.mimeType, data: ref.base64Data },
      };
    }

    throw new Error("Anthropic FileRef must have a non-empty fileId or base64Data");
  }

  // OpenAI — image_url content block; Files API references use file:// URI scheme
  if (ref.fileId !== "") {
    return {
      type: "image_url",
      image_url: { url: `file://${ref.fileId}` },
    };
  }

  if (ref.base64Data !== undefined && ref.base64Data !== "") {
    // Same guard as Anthropic path — validate before embedding in the data: URI.
    validateBase64(ref.base64Data);
    return {
      type: "image_url",
      image_url: { url: `data:${ref.mimeType};base64,${ref.base64Data}` },
    };
  }

  throw new Error("OpenAI FileRef must have a non-empty fileId or base64Data");
}

/** Barrel-compatible namespace for callers that prefer named-object imports. */
export const filesApi = {
  validateFilePayload,
  buildAttachmentBlock,
  ALLOWED_MIME_TYPES,
  DEFAULT_MAX_FILE_BYTES,
};
