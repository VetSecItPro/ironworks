/**
 * Tests for the envelope encryption helper (secrets-vault.ts).
 *
 * Each test sets IRONWORKS_SECRETS_KEK_B64 via the env-scope helper to ensure
 * no state leaks between tests.
 */

import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, getKeyLastFour } from "../services/secrets-vault.js";

// A valid base64-encoded 32-byte KEK for testing
const VALID_KEK = randomBytes(32).toString("base64");
const WRONG_KEK = randomBytes(32).toString("base64");

function withKek(kek: string | undefined): () => void {
  const prev = process.env.IRONWORKS_SECRETS_KEK_B64;
  if (kek === undefined) {
    delete process.env.IRONWORKS_SECRETS_KEK_B64;
  } else {
    process.env.IRONWORKS_SECRETS_KEK_B64 = kek;
  }
  return () => {
    if (prev === undefined) {
      delete process.env.IRONWORKS_SECRETS_KEK_B64;
    } else {
      process.env.IRONWORKS_SECRETS_KEK_B64 = prev;
    }
  };
}

describe("encryptSecret / decryptSecret", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = withKek(VALID_KEK);
  });

  afterEach(() => {
    restoreEnv();
  });

  it("round-trips a plaintext API key", () => {
    const key = "sk-ant-api-test-1234567890abcdef";
    const bundle = encryptSecret(key);
    const recovered = decryptSecret(bundle);
    expect(recovered).toBe(key);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const key = "sk-ant-same-key";
    const bundle1 = encryptSecret(key);
    const bundle2 = encryptSecret(key);
    // Different IVs mean different ciphertexts even for the same plaintext
    expect(bundle1.encryptedKey.toString("hex")).not.toBe(bundle2.encryptedKey.toString("hex"));
  });

  it("throws when trying to decrypt with the wrong KEK", () => {
    const key = "sk-ant-confidential";
    const bundle = encryptSecret(key);

    const restore = withKek(WRONG_KEK);
    try {
      expect(() => decryptSecret(bundle)).toThrow();
    } finally {
      restore();
    }
  });

  it("throws when the encrypted_dek auth tag is tampered", () => {
    const bundle = encryptSecret("sk-ant-tamper-test");
    // Flip a byte in the DEK auth tag to simulate tampering
    const tamperedTag = Buffer.from(bundle.dekAuthTag);
    tamperedTag[0] ^= 0xff;
    const tampered = { ...bundle, dekAuthTag: tamperedTag };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws when the encrypted_key auth tag is tampered", () => {
    const bundle = encryptSecret("sk-ant-tamper-key");
    const tamperedTag = Buffer.from(bundle.keyAuthTag);
    tamperedTag[0] ^= 0xff;
    const tampered = { ...bundle, keyAuthTag: tamperedTag };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws on empty plaintext", () => {
    expect(() => encryptSecret("")).toThrow("must not be empty");
  });
});

describe("encryptSecret — KEK validation", () => {
  it("throws when KEK env var is not set", () => {
    const restore = withKek(undefined);
    try {
      expect(() => encryptSecret("sk-ant-test")).toThrow("IRONWORKS_SECRETS_KEK_B64");
    } finally {
      restore();
    }
  });

  it("throws when KEK decodes to wrong byte length", () => {
    // 16 bytes instead of 32
    const shortKek = randomBytes(16).toString("base64");
    const restore = withKek(shortKek);
    try {
      expect(() => encryptSecret("sk-ant-short")).toThrow("32 bytes");
    } finally {
      restore();
    }
  });
});

describe("getKeyLastFour", () => {
  it("returns last 4 chars of a normal key", () => {
    expect(getKeyLastFour("sk-ant-abcdefgh")).toBe("efgh");
  });

  it("pads short keys with *", () => {
    expect(getKeyLastFour("ab")).toBe("**ab");
  });

  it("handles empty string", () => {
    expect(getKeyLastFour("")).toBe("****");
  });
});
