import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level encryption for personal data that must be kept but rarely read
 * (hosts' personnummer, for DAC7 reporting). AES-256-GCM with a key from
 * IDENTITY_ENCRYPTION_KEY (32 bytes, base64: `openssl rand -base64 32`).
 * Format: `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 */
const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.IDENTITY_ENCRYPTION_KEY;
  if (!raw) throw new Error("IDENTITY_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("IDENTITY_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function hasEncryptionKey(): boolean {
  return Boolean(process.env.IDENTITY_ENCRYPTION_KEY);
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptField(stored: string): string {
  const [version, iv, tag, ct] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !ct) throw new Error("Unknown encrypted field format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
