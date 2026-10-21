import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/session";
import { parseSekToOre } from "@/lib/money";
import { normalizeOrgNumber } from "@/lib/org-number";
import { normalizeVehicleReg } from "@/lib/validation";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    for (const p of ["/", "/uthyrare", "/plats/abc?start=2026-10-20T10:00", "/sok#karta"]) expect(safeNext(p), p).toBe(p);
  });

  it("refuses anything that could leave the site, or isn't a path", () => {
    for (const p of ["//evil.com", "//evil.com/path", "/\\evil.com", "/\\/evil.com", "https://evil.com", "http://evil.com/", "javascript:alert(1)", "evil.com", "uthyrare", "../admin", "", " /x"]) {
      expect(safeNext(p), p).toBe("/");
    }
    for (const v of [null, undefined, 42, ["/x"], { href: "/x" }]) expect(safeNext(v)).toBe("/");
  });

  it("uses the given fallback", () => {
    expect(safeNext("//evil.com", "/uthyrare")).toBe("/uthyrare");
    expect(safeNext(null, "/uthyrare")).toBe("/uthyrare");
  });
});

describe("parseSekToOre", () => {
  it("parses kronor with a comma or a point and up to two decimals", () => {
    expect(parseSekToOre("25")).toBe(2500);
    expect(parseSekToOre("25,50")).toBe(2550);
    expect(parseSekToOre("25.5")).toBe(2550);
    expect(parseSekToOre("0,05")).toBe(5);
    expect(parseSekToOre(" 1 250 ")).toBe(125000);
    // No floating point drift.
    expect(parseSekToOre("19,99")).toBe(1999);
    expect(parseSekToOre("1,15")).toBe(115);
  });

  it("returns null for empty or malformed amounts", () => {
    for (const v of [null, undefined, "", "   ", "abc", "-5", "1,234", "25,", ",5", "1.2.3", "25 kr", "1e3"]) expect(parseSekToOre(v), String(v)).toBeNull();
  });
});

describe("normalizeVehicleReg", () => {
  it("upper-cases and removes spaces and dashes", () => {
    expect(normalizeVehicleReg("abc 123")).toBe("ABC123");
    expect(normalizeVehicleReg("abc-12a")).toBe("ABC12A");
    expect(normalizeVehicleReg("  ÅÄÖ 123 ")).toBe("ÅÄÖ123");
  });

  it("accepts foreign plates of 2 to 10 letters and digits", () => {
    expect(normalizeVehicleReg("B-MW 1234")).toBe("BMW1234");
    expect(normalizeVehicleReg("ab")).toBe("AB");
  });

  it("refuses plates that are too short, too long or have other characters", () => {
    for (const v of ["", "A", "ABCDEFGHIJK", "ABC_123", "ABC.123", "<script>"]) expect(normalizeVehicleReg(v), v).toBeNull();
  });
});

describe("normalizeOrgNumber", () => {
  it("normalises to NNNNNN-NNNN", () => {
    expect(normalizeOrgNumber("5560160680")).toBe("556016-0680");
    expect(normalizeOrgNumber("556016-0680")).toBe("556016-0680");
    expect(normalizeOrgNumber(" 556016 0680 ")).toBe("556016-0680");
    expect(normalizeOrgNumber("769600-1234")).toBe("769600-1234");
  });

  it("accepts the 12-digit form with the 16 prefix", () => {
    expect(normalizeOrgNumber("16556016-0680")).toBe("556016-0680");
    expect(normalizeOrgNumber("165560160680")).toBe("556016-0680");
  });

  it("refuses a wrong check digit, the wrong length and personnummer", () => {
    expect(normalizeOrgNumber("556016-0681")).toBeNull();
    expect(normalizeOrgNumber("556016-068")).toBeNull();
    expect(normalizeOrgNumber("5560160680 1")).toBeNull();
    expect(normalizeOrgNumber("")).toBeNull();
    // A personnummer: third digit below 2 (even with a valid check digit).
    expect(normalizeOrgNumber("640101-1234")).toBeNull();
    expect(normalizeOrgNumber("196401011234")).toBeNull();
  });
});
