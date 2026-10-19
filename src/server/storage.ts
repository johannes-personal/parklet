import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documentBlobs } from "@/db/schema";

/**
 * Private document store for verification documents (ownership proofs,
 * rental contracts, board minutes). Files are never publicly reachable; they
 * are streamed through an authorised route handler.
 *
 * Drivers (DOCUMENT_STORAGE):
 * - "local" (default): files on disk under storage/documents. Development only.
 * - "database": bytes in the document_blobs table. Works on Vercel, where the
 *   filesystem is not persistent; fine for the demo's volumes.
 * Production should use a private, encrypted, EU-hosted bucket (Supabase
 * Storage / S3) with signed direct uploads and a retention policy.
 */
const driver = () => (process.env.DOCUMENT_STORAGE === "database" ? "database" : "local");

const root = () =>
  process.env.DOCUMENT_STORAGE_DIR
    ? path.resolve(/*turbopackIgnore: true*/ process.env.DOCUMENT_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "documents");

/** Vercel functions accept request bodies up to 4.5 MB, so uploads stay below that. */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

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
  if (bytes.length > MAX_DOCUMENT_BYTES) return { error: "Filen är större än 4 MB. Ta ett foto med lägre upplösning eller ladda upp en PDF." };
  const type = sniffMime(bytes);
  if (!type) return { error: "Ladda upp en PDF eller en bild (JPG, PNG eller HEIC)." };
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${type.ext}`;
  if (driver() === "database") {
    await db.insert(documentBlobs).values({ storageKey, bytes });
  } else {
    const file = path.join(root(), storageKey);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { mode: 0o600 });
  }
  return { storageKey, mimeType: type.mime, sizeBytes: bytes.length };
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  if (driver() === "database") {
    const [row] = await db.select({ bytes: documentBlobs.bytes }).from(documentBlobs).where(eq(documentBlobs.storageKey, storageKey)).limit(1);
    if (!row) throw new Error("Document not found");
    return Buffer.from(row.bytes);
  }
  const file = path.resolve(root(), storageKey);
  if (!file.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return readFile(file);
}

export async function deleteDocumentFile(storageKey: string): Promise<void> {
  if (driver() === "database") {
    await db.delete(documentBlobs).where(eq(documentBlobs.storageKey, storageKey));
    return;
  }
  const file = path.resolve(root(), storageKey);
  if (!file.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  await rm(file, { force: true });
}
