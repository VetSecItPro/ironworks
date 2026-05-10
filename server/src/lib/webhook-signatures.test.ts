import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyHmacSha256, verifySendgridSignature } from "./webhook-signatures.js";

describe("verifyHmacSha256", () => {
  const SECRET = "test-secret-deadbeef";
  const BODY = Buffer.from(JSON.stringify({ event: "delivered", id: "abc" }));
  const validSig = crypto.createHmac("sha256", SECRET).update(BODY).digest("hex");

  it("accepts a correct signature in bare hex form", () => {
    expect(verifyHmacSha256(BODY, validSig, SECRET)).toBe(true);
  });

  it("accepts a correct signature with sha256= prefix", () => {
    expect(verifyHmacSha256(BODY, `sha256=${validSig}`, SECRET)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const tampered = `${validSig.slice(0, -2)}00`;
    expect(verifyHmacSha256(BODY, tampered, SECRET)).toBe(false);
  });

  it("rejects when body has been modified", () => {
    const modified = Buffer.from(`${BODY.toString()} `);
    expect(verifyHmacSha256(modified, validSig, SECRET)).toBe(false);
  });

  it("rejects when secret is wrong", () => {
    expect(verifyHmacSha256(BODY, validSig, "wrong-secret")).toBe(false);
  });

  it("rejects empty / missing signature", () => {
    expect(verifyHmacSha256(BODY, "", SECRET)).toBe(false);
    expect(verifyHmacSha256(BODY, null, SECRET)).toBe(false);
    expect(verifyHmacSha256(BODY, undefined, SECRET)).toBe(false);
  });

  it("rejects empty / missing secret", () => {
    expect(verifyHmacSha256(BODY, validSig, "")).toBe(false);
  });

  it("rejects non-hex garbage without throwing", () => {
    expect(verifyHmacSha256(BODY, "not-a-hex-string!!", SECRET)).toBe(false);
    expect(verifyHmacSha256(BODY, "sha256=zzzz", SECRET)).toBe(false);
  });

  it("rejects length-mismatched signatures (no oracle)", () => {
    expect(verifyHmacSha256(BODY, "abcd", SECRET)).toBe(false);
  });
});

describe("verifySendgridSignature", () => {
  // Generate a fresh Ed25519 key pair for the test.
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
  const publicKeyBareB64 = (publicKey.export({ type: "spki", format: "der" }) as Buffer).toString("base64");

  const BODY = Buffer.from(JSON.stringify([{ event: "delivered" }]));
  const TIMESTAMP = "1700000000";
  // Pin "now" to the fixture timestamp so the freshness check (5-min window
  // added in SEC-WEBHOOK-REPLAY-002 fix) accepts the fixed test timestamp.
  // Without this, fixtures dated 2023 would be rejected as stale at test time.
  const NOW_AT_FIXTURE = () => 1700000000000;

  function sign(ts: string, body: Buffer): string {
    const message = Buffer.concat([Buffer.from(ts, "utf8"), body]);
    return crypto.sign(null, message, privateKey).toString("base64");
  }

  it("accepts a correctly-signed payload with full PEM key", () => {
    const sig = sign(TIMESTAMP, BODY);
    expect(verifySendgridSignature(BODY, TIMESTAMP, sig, publicKeyPem, { now: NOW_AT_FIXTURE })).toBe(true);
  });

  it("accepts a correctly-signed payload with bare base64 DER key (SendGrid UI form)", () => {
    const sig = sign(TIMESTAMP, BODY);
    expect(verifySendgridSignature(BODY, TIMESTAMP, sig, publicKeyBareB64, { now: NOW_AT_FIXTURE })).toBe(true);
  });

  it("rejects tampered body", () => {
    const sig = sign(TIMESTAMP, BODY);
    expect(
      verifySendgridSignature(Buffer.from("tampered"), TIMESTAMP, sig, publicKeyPem, { now: NOW_AT_FIXTURE }),
    ).toBe(false);
  });

  it("rejects tampered timestamp", () => {
    const sig = sign(TIMESTAMP, BODY);
    expect(verifySendgridSignature(BODY, "1700000001", sig, publicKeyPem, { now: NOW_AT_FIXTURE })).toBe(false);
  });

  it("rejects empty inputs", () => {
    expect(verifySendgridSignature(BODY, "", "sig", publicKeyPem, { now: NOW_AT_FIXTURE })).toBe(false);
    expect(verifySendgridSignature(BODY, TIMESTAMP, "", publicKeyPem, { now: NOW_AT_FIXTURE })).toBe(false);
    expect(verifySendgridSignature(BODY, TIMESTAMP, "sig", "", { now: NOW_AT_FIXTURE })).toBe(false);
  });

  it("rejects malformed key without throwing", () => {
    const sig = sign(TIMESTAMP, BODY);
    expect(verifySendgridSignature(BODY, TIMESTAMP, sig, "not-a-key", { now: NOW_AT_FIXTURE })).toBe(false);
  });

  it("rejects malformed signature without throwing", () => {
    expect(
      verifySendgridSignature(BODY, TIMESTAMP, "!!!not-base64-but-decodes-to-junk!!!", publicKeyPem, {
        now: NOW_AT_FIXTURE,
      }),
    ).toBe(false);
  });

  // SEC-WEBHOOK-REPLAY-002 regression coverage
  it("rejects stale timestamp outside replay window (default 5 min)", () => {
    const sig = sign(TIMESTAMP, BODY);
    // 6 minutes after the signed timestamp = outside the 5-minute window
    const sixMinLater = () => 1700000000000 + 6 * 60 * 1000;
    expect(verifySendgridSignature(BODY, TIMESTAMP, sig, publicKeyPem, { now: sixMinLater })).toBe(false);
  });

  it("rejects future-dated timestamp outside replay window", () => {
    const sig = sign(TIMESTAMP, BODY);
    // "Now" is 6 minutes BEFORE the signed timestamp
    const sixMinBefore = () => 1700000000000 - 6 * 60 * 1000;
    expect(verifySendgridSignature(BODY, TIMESTAMP, sig, publicKeyPem, { now: sixMinBefore })).toBe(false);
  });

  it("accepts a fresh timestamp inside custom replay window", () => {
    const sig = sign(TIMESTAMP, BODY);
    const oneHourLater = () => 1700000000000 + 60 * 60 * 1000;
    expect(
      verifySendgridSignature(BODY, TIMESTAMP, sig, publicKeyPem, { now: oneHourLater, replayWindowSec: 7200 }),
    ).toBe(true);
  });

  it("rejects non-numeric timestamp", () => {
    const sig = sign(TIMESTAMP, BODY);
    expect(verifySendgridSignature(BODY, "not-a-number", sig, publicKeyPem, { now: NOW_AT_FIXTURE })).toBe(false);
  });
});
