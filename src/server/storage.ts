import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_DOCUMENT_BYTES, TOO_LARGE } from "@/lib/documents";
import { serviceHeaders } from "@/db/api";

/**
 * Private document store for verification documents (ownership proofs,
 * rental contracts, board minutes). Files are never publicly reachable; they
 * are streamed through an authorised route handler.
 *
 * Drivers (DOCUMENT_STORAGE):
 * - "local" (default): files on disk under storage/documents. Development only.
 * - "supabase": a private Supabase Storage bucket (DOCUMENT_BUCKET, default
 *   "documents"), reached with the service key, so only the server can read it.
 */
const driver = () => (process.env.DOCUMENT_STORAGE === "supabase" ? "supabase" : "local");

const root = () =>
  process.env.DOCUMENT_STORAGE_DIR
    ? path.resolve(/*turbopackIgnore: true*/ process.env.DOCUMENT_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "documents");


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
  if (bytes.length > MAX_DOCUMENT_BYTES) return { error: TOO_LARGE };
  const type = sniffMime(bytes);
  if (!type) return { error: "Ladda upp en PDF eller en bild (JPG, PNG eller HEIC)." };
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${type.ext}`;
  if (driver() === "supabase") {
    await bucket.upload(storageKey, bytes, type.mime);
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
    if (!stored) throw new Error("Document not found");
    return stored;
  }
  const file = path.resolve(root(), storageKey);
  if (!file.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return readFile(file);
}

export async function deleteDocumentFile(storageKey: string): Promise<void> {
  if (driver() === "supabase") {
    await bucket.remove([storageKey]);
    return;
  }
  const file = path.resolve(root(), storageKey);
  if (!file.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  await rm(file, { force: true });
}

/**
 * Deletes many documents' files at once (the demo reset, src/server/demo-data.ts):
 * a request per 1,000 keys to the bucket, or the local files side by side. Files
 * that are already gone are fine.
 */
export async function deleteDocumentFiles(storageKeys: string[]): Promise<void> {
  if (driver() === "supabase") {
    for (let i = 0; i < storageKeys.length; i += 1000) await bucket.remove(storageKeys.slice(i, i + 1000));
    return;
  }
  await Promise.all(storageKeys.map((key) => deleteDocumentFile(key)));
}

/** Supabase Storage's REST API, with the service key (server only; the bucket has no public access). */
const bucket = {
  config() {
    const base = process.env.SUPABASE_URL;
    if (!base) throw new Error("DOCUMENT_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
    return {
      url: (p: string) => `${base.replace(/\/$/, "")}/storage/v1/${p}`,
      name: process.env.DOCUMENT_BUCKET ?? "documents",
      headers: serviceHeaders(),
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

  async remove(storageKeys: string[]) {
    const c = this.config();
    const res = await fetch(c.url(`object/${c.name}`), {
      method: "DELETE",
      headers: { ...c.headers, "content-type": "application/json" },
      body: JSON.stringify({ prefixes: storageKeys }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`storage: delete failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  },
};
