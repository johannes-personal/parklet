import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteDocumentFile, readDocument, storeDocument } from "@/server/storage";

// The default "local" storage driver, on a temporary directory.
const parent = mkdtempSync(path.join(tmpdir(), "parklet-storage-"));
const root = path.join(parent, "documents");
const pdf = Buffer.from("%PDF-1.4\n% test\n");

beforeAll(() => {
  delete process.env.DOCUMENT_STORAGE;
  process.env.DOCUMENT_STORAGE_DIR = root;
  // Files next to the store that a crafted key might try to reach.
  writeFileSync(path.join(parent, "secret.txt"), "secret");
});
afterAll(() => {
  delete process.env.DOCUMENT_STORAGE_DIR;
  rmSync(parent, { recursive: true, force: true });
});

describe("the local document store", () => {
  it("stores, reads and deletes a document under its directory", async () => {
    const stored = await storeDocument(pdf);
    if ("error" in stored) throw new Error(stored.error);
    expect(stored).toMatchObject({ mimeType: "application/pdf", sizeBytes: pdf.length });
    expect(stored.storageKey).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}\.pdf$/);
    expect(await readDocument(stored.storageKey)).toEqual(pdf);
    await deleteDocumentFile(stored.storageKey);
    await expect(readDocument(stored.storageKey)).rejects.toThrow(/ENOENT/);
  });

  it("refuses keys that point outside its directory", async () => {
    const outside = ["../../etc/passwd", "../secret.txt", "/etc/passwd", "2026-10/../../secret.txt", "../documents-evil/x.pdf", "", "."];
    for (const key of outside) {
      await expect(readDocument(key), key).rejects.toThrow("Invalid storage key");
      await expect(deleteDocumentFile(key), key).rejects.toThrow("Invalid storage key");
    }
  });

  it("refuses files that aren't a PDF or an image", async () => {
    expect(await storeDocument(Buffer.from("<html>"))).toEqual({ error: "Ladda upp en PDF eller en bild (JPG, PNG eller HEIC)." });
    expect(await storeDocument(Buffer.alloc(0))).toEqual({ error: "Filen är tom." });
  });
});
