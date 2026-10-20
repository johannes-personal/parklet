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
 * - "supabase": a private Supabase Storage bucket (DOCUMENT_BUCKET, default
 *   "documents"), reached with the service key, so only the server can read it.
 *   Files still in document_blobs from the "database" driver are read from
 *   there and moved to the bucket the first time they are read.
 * - "database": bytes in the document_blobs table.
 */
const driver = () => {
  const d = process.env.DOCUMENT_STORAGE;
  return d === "supabase" || d === "database" ? d : "local";
};

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
  if (driver() === "supabase") {
    await bucket.upload(storageKey, bytes, type.mime);
  } else if (driver() === "database") {
    await db.insert(documentBlobs).values({ storageKey, bytes });
  } else {
    const file = path.join(root(), storageKey);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { mode: 0o600 });
  }
  return { storageKey, mimeType: type.mime, sizeBytes: bytes.length };
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  if (driver() === "supabase") {
    const stored = await bucket.download(storageKey);
    if (stored) return stored;
    // Uploaded before the move to Storage: serve it, and move it now.
    const legacy = await readBlob(storageKey);
    if (!legacy) throw new Error("Document not found");
    const type = sniffMime(legacy);
    if (type) {
      await bucket.upload(storageKey, legacy, type.mime);
      await db.delete(documentBlobs).where(eq(documentBlobs.storageKey, storageKey));
    }
    return legacy;
  }
  if (driver() === "database") {
    const bytes = await readBlob(storageKey);
    if (!bytes) throw new Error("Document not found");
    return bytes;
  }
  const file = path.resolve(root(), storageKey);
  if (!file.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return readFile(file);
}

export async function deleteDocumentFile(storageKey: string): Promise<void> {
  if (driver() === "supabase") {
    await bucket.remove(storageKey);
    await db.delete(documentBlobs).where(eq(documentBlobs.storageKey, storageKey));
    return;
  }
  if (driver() === "database") {
    await db.delete(documentBlobs).where(eq(documentBlobs.storageKey, storageKey));
    return;
  }
  const file = path.resolve(root(), storageKey);
  if (!file.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  await rm(file, { force: true });
}

async function readBlob(storageKey: string): Promise<Buffer | null> {
  const [row] = await db.select({ bytes: documentBlobs.bytes }).from(documentBlobs).where(eq(documentBlobs.storageKey, storageKey)).limit(1);
  return row ? Buffer.from(row.bytes) : null;
}

/** Supabase Storage's REST API, with the service key (server only; the bucket has no public access). */
const bucket = {
  config() {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!base || !key) throw new Error("DOCUMENT_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).");
    return {
      url: (p: string) => `${base.replace(/\/$/, "")}/storage/v1/${p}`,
      name: process.env.DOCUMENT_BUCKET ?? "documents",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    };
  },

  async upload(storageKey: string, bytes: Buffer, mime: string) {
    const c = this.config();
    const res = await fetch(c.url(`object/${c.name}/${storageKey}`), {
      method: "POST",
      headers: { ...c.headers, "content-type": mime, "x-upsert": "false" },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`storage: upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  },

  /** The file, or null if the bucket doesn't have it. */
  async download(storageKey: string): Promise<Buffer | null> {
    const c = this.config();
    const res = await fetch(c.url(`object/authenticated/${c.name}/${storageKey}`), { headers: c.headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = await res.text();
    // Storage answers a missing object with 400 or 404 and "not_found".
    if (res.status === 404 || /not.?found/i.test(body)) return null;
    throw new Error(`storage: download failed (${res.status}): ${body.slice(0, 200)}`);
  },

  async remove(storageKey: string) {
    const c = this.config();
    const res = await fetch(c.url(`object/${c.name}`), {
      method: "DELETE",
      headers: { ...c.headers, "content-type": "application/json" },
      body: JSON.stringify({ prefixes: [storageKey] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`storage: delete failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  },
};
