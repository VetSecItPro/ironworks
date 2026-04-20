/**
 * Envelope encryption helper for workspace provider API keys.
 *
 * Two-layer AES-256-GCM at rest (defense in depth):
 *   1. A random per-secret DEK (data-encryption-key) encrypts the API key.
 *   2. The KEK (key-encryption-key) from env IRONWORKS_SECRETS_KEK_B64
 *      encrypts the DEK.
 *
 * Only the KEK env var ever leaves this module. The plaintext API key and DEK
 * are never logged, never returned by APIs, and never stored unencrypted.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEK_ENV = "IRONWORKS_SECRETS_KEK_B64";
const KEY_BYTE_LENGTH = 32; // AES-256
const IV_BYTE_LENGTH = 12; // GCM recommended IV length
const TAG_BYTE_LENGTH = 16; // GCM auth tag length

export type EncryptedBundle = {
  /** AES-256-GCM ciphertext of the API key (plaintext encrypted with DEK) */
  encryptedKey: Buffer;
  /** AES-256-GCM ciphertext of the DEK (encrypted with KEK) */
  encryptedDek: Buffer;
  /** 12-byte IV used to encrypt the DEK */
  dekIv: Buffer;
  /** 16-byte GCM auth tag from DEK encryption */
  dekAuthTag: Buffer;
  /** 12-byte IV used to encrypt the API key */
  keyIv: Buffer;
  /** 16-byte GCM auth tag from API key encryption */
  keyAuthTag: Buffer;
};

/**
 * Load and validate the KEK from the environment. Called once per encrypt/decrypt
 * operation so that key rotation takes effect without a server restart.
 * Throws on startup if the env var is missing or the decoded length is wrong.
 */
function loadKek(): Buffer {
  const raw = process.env[KEK_ENV];
  if (!raw) {
    throw new Error(`${KEK_ENV} is not set. Generate a 32-byte key with: openssl rand -base64 32`);
  }
  const kek = Buffer.from(raw, "base64");
  if (kek.byteLength !== KEY_BYTE_LENGTH) {
    throw new Error(
      `${KEK_ENV} must decode to exactly 32 bytes (got ${kek.byteLength}). ` +
        "Regenerate with: openssl rand -base64 32",
    );
  }
  return kek;
}

function aesGcmEncrypt(key: Buffer, plaintext: Buffer): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

function aesGcmDecrypt(key: Buffer, ciphertext: Buffer, iv: Buffer, authTag: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  // GCM auth tag verification happens inside final() — throws on tamper
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypt a plaintext API key using two-layer envelope encryption.
 * A fresh random DEK is generated for each call.
 */
export function encryptSecret(plaintext: string): EncryptedBundle {
  if (plaintext === null || plaintext === undefined) {
    throw new Error("encryptSecret: plaintext must not be null or undefined");
  }
  if (plaintext.length === 0) {
    throw new Error("encryptSecret: plaintext must not be empty");
  }

  const kek = loadKek();
  const dek = randomBytes(KEY_BYTE_LENGTH);

  // Layer 1: encrypt the API key with the DEK
  const {
    ciphertext: encryptedKey,
    iv: keyIv,
    authTag: keyAuthTag,
  } = aesGcmEncrypt(dek, Buffer.from(plaintext, "utf8"));

  // Layer 2: encrypt the DEK with the KEK
  const { ciphertext: encryptedDek, iv: dekIv, authTag: dekAuthTag } = aesGcmEncrypt(kek, dek);

  return { encryptedKey, encryptedDek, dekIv, dekAuthTag, keyIv, keyAuthTag };
}

/**
 * Decrypt a bundle back to the original plaintext API key.
 * Throws if either auth tag fails (tamper detection) or the KEK is wrong.
 */
export function decryptSecret(bundle: EncryptedBundle): string {
  const kek = loadKek();

  // Unwrap DEK from KEK — throws if KEK is wrong or ciphertext was tampered
  const dek = aesGcmDecrypt(
    kek,
    Buffer.isBuffer(bundle.encryptedDek) ? bundle.encryptedDek : Buffer.from(bundle.encryptedDek),
    Buffer.isBuffer(bundle.dekIv) ? bundle.dekIv : Buffer.from(bundle.dekIv),
    Buffer.isBuffer(bundle.dekAuthTag) ? bundle.dekAuthTag : Buffer.from(bundle.dekAuthTag),
  );

  // Decrypt the API key with the unwrapped DEK
  const plaintext = aesGcmDecrypt(
    dek,
    Buffer.isBuffer(bundle.encryptedKey) ? bundle.encryptedKey : Buffer.from(bundle.encryptedKey),
    Buffer.isBuffer(bundle.keyIv) ? bundle.keyIv : Buffer.from(bundle.keyIv),
    Buffer.isBuffer(bundle.keyAuthTag) ? bundle.keyAuthTag : Buffer.from(bundle.keyAuthTag),
  );

  return plaintext.toString("utf8");
}

/**
 * Returns the last 4 characters of an API key for safe UI display.
 * Always returns exactly 4 chars; pads with '*' if the key is shorter.
 */
export function getKeyLastFour(plaintext: string): string {
  if (!plaintext || plaintext.length === 0) return "****";
  return plaintext.slice(-4).padStart(4, "*");
}
