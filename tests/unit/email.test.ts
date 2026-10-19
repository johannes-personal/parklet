import { describe, expect, it } from "vitest";
import { isDeliverableAddress } from "@/lib/email";

describe("isDeliverableAddress", () => {
  it("sends to real addresses only", () => {
    expect(isDeliverableAddress("johannes@jvo.se")).toBe(true);
    expect(isDeliverableAddress("styrelsen@brf-exempel.se")).toBe(true);
    for (const a of ["forare@parklet.test", "x@example.com", "styrelsen.haga@example.com", "a@foo.example", "a@b.invalid", "not an address"]) {
      expect(isDeliverableAddress(a), a).toBe(false);
    }
  });
});
