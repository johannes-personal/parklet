import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level encryption for personal data that must be kept but rarely read
 * (hosts' personnummer, for DAC7 reporting). AES-256-GCM with a key from
 * IDENTITY_ENCRYPTION_KEY (32 bytes, base64 or hex: `openssl rand -base64 32`).
 * Format: `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 */
const VERSION = "v1";

/** Accepts base64 (`openssl rand -base64 32`) or hex (`openssl rand -hex 32`), ignoring stray quotes and whitespace. */
function parseKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim().replace(/^["']|["']$/g, "");
  if (!value) return null;
  const k = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  return k.length === 32 ? k : null;
}

function key(): Buffer {
  const k = parseKey(process.env.IDENTITY_ENCRYPTION_KEY);
  if (!k) throw new Error("IDENTITY_ENCRYPTION_KEY must be 32 bytes, base64- or hex-encoded");
  return k;
}

/** Set and valid. A set but malformed key counts as missing, so BankID is switched off before anyone signs. */
export function hasEncryptionKey(): boolean {
  return parseKey(process.env.IDENTITY_ENCRYPTION_KEY) !== null;
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
