import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private document store for verification documents (ownership proofs,
 * rental contracts, board minutes). Files are never publicly reachable; they
 * are streamed through an authorised route handler.
 *
 * The MVP writes to the local disk. In production use an EU-hosted,
 * encrypted S3-compatible bucket with a retention policy (see docs/03-mvp.md).
 */
const root = () =>
  process.env.DOCUMENT_STORAGE_DIR
    ? path.resolve(/*turbopackIgnore: true*/ process.env.DOCUMENT_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "documents");

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  {
    mime: "image/heic",
    ext: "heic",
    test: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|mif1|msf1)$/.test(b.subarray(8, 12).toString("latin1")),
  },
];

/** Detect the real file type from its bytes; never trust the browser-supplied type. */
export function sniffMime(bytes: Buffer): { mime: string; ext: string } | null {
  return SIGNATURES.find((s) => s.test(bytes)) ?? null;
}

export type StoredFile = { storageKey: string; mimeType: string; sizeBytes: number };

export async function storeDocument(bytes: Buffer): Promise<StoredFile | { error: string }> {
  if (bytes.length === 0) return { error: "Filen är tom." };
  if (bytes.length > MAX_DOCUMENT_BYTES) return { error: "Filen är större än 10 MB." };
  const type = sniffMime(bytes);
  if (!type) return { error: "Ladda upp en PDF eller en bild (JPG, PNG eller HEIC)." };
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${type.ext}`;
  const file = path.join(root(), storageKey);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes, { mode: 0o600 });
  return { storageKey, mimeType: type.mime, sizeBytes: bytes.length };
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  const file = path.resolve(root(), storageKey);
  if (!file.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return readFile(file);
}
