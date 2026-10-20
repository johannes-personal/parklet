import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "./direct-db";
import { sendEmail } from "@/server/mailer";
import { freePort } from "../../scripts/postgrest.mjs";
import { allMail, resetDb } from "./helpers";

/** A stand-in for Resend's API: records requests and answers with `status`. */
const received: { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
let status = 500;
const server = http.createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    received.push({ headers: req.headers, body: JSON.parse(data) });
    res.writeHead(status, { "content-type": "application/json" });
    res.end(status === 200 ? '{"id":"email_1"}' : '{"name":"internal_server_error","message":"boom"}');
  });
});
let url = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/emails`;
});
beforeEach(async () => {
  await resetDb();
  received.length = 0;
  status = 500;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.MAIL_FROM = "Parklet <hej@parklet.se>";
  process.env.RESEND_API_URL = url;
});
afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.RESEND_API_URL;
  vi.restoreAllMocks();
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

const content = { heading: "Hej", paragraphs: ["Ett test."] };

describe("sending e-mail through Resend", () => {
  it("keeps the mail in the outbox and does not throw when Resend fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendEmail("styrelsen@brf-exempel.se", "Ämne", content)).resolves.toBeUndefined();

    expect(received).toHaveLength(1);
    expect(received[0].headers.authorization).toBe("Bearer re_test_key");
    expect(received[0].headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(received[0].body).toMatchObject({ from: "Parklet <hej@parklet.se>", to: ["styrelsen@brf-exempel.se"], subject: "Ämne" });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Resend refused the mail: HTTP 500"));
    expect((await allMail()).map((m) => [m.to, m.subject])).toEqual([["styrelsen@brf-exempel.se", "Ämne"]]);
  });

  it("does not throw when Resend can't be reached", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.RESEND_API_URL = `http://127.0.0.1:${await freePort()}/emails`;
    await expect(sendEmail("styrelsen@brf-exempel.se", "Ämne", content)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[mail] Resend request failed", expect.any(String));
    expect(await allMail()).toHaveLength(1);
  });

  it("sends real addresses, with both text and HTML", async () => {
    status = 200;
    const error = vi.spyOn(console, "error");
    await sendEmail("styrelsen@brf-exempel.se", "Ämne", content);
    expect(received).toHaveLength(1);
    expect(received[0].body).toMatchObject({ text: expect.stringContaining("Ett test."), html: expect.stringContaining("Ett test.") });
    expect(error).not.toHaveBeenCalled();
  });

  it("never sends to reserved test domains such as @parklet.test", async () => {
    status = 200;
    for (const to of ["forare@parklet.test", "x@example.com"]) await sendEmail(to, "Ämne", content);
    expect(received).toEqual([]);
    expect((await allMail()).map((m) => m.to)).toEqual(["forare@parklet.test", "x@example.com"]);
  });
});
