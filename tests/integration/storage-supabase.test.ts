import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { documentBlobs } from "@/db/schema";

// The "supabase" driver against an in-memory stand-in for Supabase Storage's REST API.
process.env.DOCUMENT_STORAGE = "supabase";
process.env.SUPABASE_URL = "https://project.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

const objects = new Map<string, Buffer>();
const calls: { method: string; url: string; auth: string | null }[] = [];
vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
  const url = new URL(input);
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  calls.push({ method, url: url.pathname, auth: headers.get("authorization") });
  const prefix = "/storage/v1/object/";
  const rest = url.pathname.slice(prefix.length);
  if (method === "POST") {
    const key = rest.replace(/^documents\//, "");
    if (objects.has(key)) return new Response('{"error":"Duplicate"}', { status: 409 });
    objects.set(key, Buffer.from(init.body as Uint8Array));
    return new Response("{}", { status: 200 });
  }
  if (method === "GET") {
    const key = rest.replace(/^authenticated\/documents\//, "");
    const found = objects.get(key);
    return found ? new Response(new Uint8Array(found)) : new Response('{"statusCode":"404","error":"not_found"}', { status: 400 });
  }
  if (method === "DELETE") {
    for (const key of JSON.parse(String(init.body)).prefixes) objects.delete(key);
    return new Response("[]", { status: 200 });
  }
  return new Response("", { status: 405 });
});

const { db } = await import("@/db");
const { deleteDocumentFile, readDocument, storeDocument } = await import("@/server/storage");
const pdf = Buffer.from("%PDF-1.4\n% test document\n");

beforeEach(() => {
  objects.clear();
  calls.length = 0;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$client.end();
});

test("documents are stored in, read from and deleted from the bucket, with the service key", async () => {
  const stored = await storeDocument(pdf);
  if ("error" in stored) throw new Error(stored.error);
  expect(stored.mimeType).toBe("application/pdf");
  expect(objects.get(stored.storageKey)).toEqual(pdf);
  expect(calls.every((c) => c.auth === "Bearer service-key")).toBe(true);

  expect(await readDocument(stored.storageKey)).toEqual(pdf);
  await deleteDocumentFile(stored.storageKey);
  expect(objects.has(stored.storageKey)).toBe(false);
  await expect(readDocument(stored.storageKey)).rejects.toThrow("Document not found");
});

test("a document still in the database is served and moved to the bucket", async () => {
  const storageKey = "2026-10/legacy-test.pdf";
  await db.delete(documentBlobs).where(eq(documentBlobs.storageKey, storageKey));
  await db.insert(documentBlobs).values({ storageKey, bytes: pdf });

  expect(await readDocument(storageKey)).toEqual(pdf);
  expect(objects.get(storageKey)).toEqual(pdf);
  expect(await db.select().from(documentBlobs).where(eq(documentBlobs.storageKey, storageKey))).toHaveLength(0);
  // Next time it comes from the bucket.
  expect(await readDocument(storageKey)).toEqual(pdf);
});
