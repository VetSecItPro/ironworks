# TASK B.17 Review — files-api.ts

**Reviewer:** Claude Code Agent  
**Date:** 2026-04-19  
**File:** `packages/adapter-utils/src/http/files-api.ts`  
**Tests:** `packages/adapter-utils/src/http/__tests__/files-api.test.ts`  
**Test Results:** 19/19 passing; typecheck clean  

---

## SPEC VERDICT: **PASS** ✓

All specification requirements met:

- **Exports:** validateFilePayload, buildAttachmentBlock, FilePayload, FileRef, ValidationResult, ValidateOptions, FileProvider, AttachmentFormat, AttachmentBlockOptions, ALLOWED_MIME_TYPES, DEFAULT_MAX_FILE_BYTES, filesApi namespace — all present
- **validateFilePayload:** Accepts PNG/JPEG/WebP/GIF/PDF; rejects executables; enforces path traversal guard on `..` and `/`; rejects empty bytes; rejects oversized files; supports maxBytes override
- **buildAttachmentBlock:** Generates Anthropic image blocks (fileId or base64); generates Anthropic document blocks for PDFs; generates OpenAI image_url blocks with `file://` or `data:` URLs; throws on provider/format mismatch; throws when neither fileId nor base64Data present
- **DEFAULT_MAX_FILE_BYTES:** Correctly set to 20*1024*1024 (20 MB)
- **Error Handling:** Returns full list of validation errors in one pass (no one-at-a-time re-validation)

---

## QUALITY VERDICT: **FAIL** ⚠

Code is well-structured, tests are comprehensive, TypeScript clean. However, five fixable security issues exist:

### CRITICAL ISSUES

#### 1. Path Traversal via Backslash (Windows) — Line 83
**Severity:** HIGH  
**Location:** `validateFilePayload` line 83  
**Issue:** Check only covers `..` and `/` but not Windows backslash `\\`
```typescript
// Current (insufficient)
} else if (payload.filename.includes('..') || payload.filename.includes('/')) {
```
**Attack:** Attacker uploads `foo\\..\\..\\etc\\passwd` on Windows; bypasses validation.  
**Fix:** Add `|| payload.filename.includes('\\')`

#### 2. Null Byte Injection — Line 73–102
**Severity:** MEDIUM  
**Location:** `validateFilePayload`  
**Issue:** No check for null bytes (`\x00` or `\u0000`)  
**Attack:** Filename `test.png\x00.exe` could confuse audit logs or server-side handlers using C-style string splitting.  
**Fix:** Add check:
```typescript
if (payload.filename.includes('\x00') || payload.filename.includes('\u0000')) {
  errors.push('filename must not contain null bytes');
}
```

#### 3. CR/LF Injection in Filename — Line 73–102
**Severity:** MEDIUM  
**Location:** `validateFilePayload`  
**Issue:** No check for carriage return (`\r`) or newline (`\n`)  
**Attack:** Filename `test.png\r\nX-Injected-Header: value` bypasses validation; could inject headers in log output or audit trails.  
**Fix:** Add check:
```typescript
if (payload.filename.includes('\r') || payload.filename.includes('\n')) {
  errors.push('filename must not contain line breaks');
}
```

### IMPORTANT ISSUES

#### 4. Base64 Format Not Validated — Lines 146, 164
**Severity:** MEDIUM  
**Location:** `buildAttachmentBlock` (both Anthropic and OpenAI branches)  
**Issue:** `ref.base64Data` accepted without format validation; malformed base64 will only be caught by provider API.  
**Risk:** Silent failure at provider; confusing error messages to end user.  
**Fix:** Validate base64 format:
```typescript
const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
if (!base64Regex.test(ref.base64Data)) {
  throw new Error(`Invalid base64 encoding in base64Data`);
}
```
Alternatively, validate via `Buffer.from(ref.base64Data, 'base64')` and catch decode errors.

#### 5. No Upper Bound on Filename Length — Line 81
**Severity:** MEDIUM  
**Location:** `validateFilePayload` line 81  
**Issue:** Filename can be arbitrarily long (e.g., 1,000,000 characters)  
**Risk:** 
  - Server-side handlers may truncate silently, creating mismatches between upload intent and stored metadata
  - Very long filenames in logs could bloat audit trails or exceed header size limits
  - Some filesystems cap at 255 bytes; provider APIs may silently truncate
**Fix:** Add length check:
```typescript
if (payload.filename.length > 255) {
  errors.push('filename must not exceed 255 characters');
}
```

### DESIGN NOTES (PASS)

- **SVG exclusion:** `image/svg+xml` is intentionally NOT in ALLOWED_MIME_TYPES. Correct decision (SVG can carry `<script>` payloads). Current code has comment mentioning this; no action needed.
- **MIME type with parameters:** Code does exact-match check only; rejects `image/png; charset=utf-8`. This is defensive and acceptable for a restrictive API. Optional enhancement: split on `;` and check prefix. Current behavior is safe.
- **Unicode normalization:** Not handled (e.g., "naïve" precomposed vs decomposed). Not critical for MVP; providers handle this at their layer.

### HYGIENE (PASS)

- No `any` types ✓
- No dead code ✓
- Error messages are clear and actionable ✓
- All 19 tests passing ✓
- Typecheck clean ✓

---

## SUMMARY

| Dimension | Status |
|-----------|--------|
| **Spec Compliance** | PASS ✓ |
| **Security** | FAIL ⚠ (3 critical path/injection gaps) |
| **Code Quality** | PASS ✓ (clean, tested, typed) |
| **Overall** | **FAIL** — Ship-blocking security issues |

**Recommendation:** Fix the three critical filename-validation issues (backslash, null bytes, CR/LF) + base64 validation before merge. Filename length check recommended for robustness.

---

## FIXES REQUIRED (Before PR Merge)

1. ✗ Add Windows path traversal check (`includes('\\'`)
2. ✗ Add null byte check (`includes('\x00')` + `includes('\u0000')`)
3. ✗ Add CR/LF check (`includes('\r')` + `includes('\n')`)
4. ✗ Add base64 format validation in `buildAttachmentBlock`
5. ~ Add filename length cap (≤255 chars) — strongly recommended

**Estimated fix time:** ~15 minutes; all fixes are simple additive checks.
