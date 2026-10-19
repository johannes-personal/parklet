import { afterEach, describe, expect, it } from "vitest";
import { decryptField, encryptField } from "@/lib/crypto";
import { normalizePersonnummer } from "@/lib/personnummer";

describe("field encryption", () => {
  const original = process.env.IDENTITY_ENCRYPTION_KEY;
  afterEach(() => {
    process.env.IDENTITY_ENCRYPTION_KEY = original;
  });

  it("round-trips and never stores the plaintext", () => {
    process.env.IDENTITY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const stored = encryptField("199001012384");
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain("199001012384");
    expect(encryptField("199001012384")).not.toBe(stored); // random IV
    expect(decryptField(stored)).toBe("199001012384");
  });

  it("rejects tampering and the wrong key", () => {
    process.env.IDENTITY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const stored = encryptField("199001012384");
    const [v, iv, tag, ct] = stored.split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptField([v, iv, tag, flipped.toString("base64url")].join("."))).toThrow();
    process.env.IDENTITY_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    expect(() => decryptField(stored)).toThrow();
  });

  it("requires a 32-byte key", () => {
    delete process.env.IDENTITY_ENCRYPTION_KEY;
    expect(() => encryptField("x")).toThrow(/not set/);
    process.env.IDENTITY_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptField("x")).toThrow(/32 bytes/);
  });
});

describe("normalizePersonnummer", () => {
  it("accepts 12 digits with or without separator", () => {
    expect(normalizePersonnummer("199001012384")).toBe("199001012384");
    expect(normalizePersonnummer("19900101-2384")).toBe("199001012384");
  });
  it("rejects anything else", () => {
    expect(normalizePersonnummer("9001012384")).toBeNull();
    expect(normalizePersonnummer(undefined)).toBeNull();
    expect(normalizePersonnummer(199001012384)).toBeNull();
  });
});
