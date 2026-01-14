import { describe, expect, it } from "vitest";

import { FIXED_FIELD_KEYS, HEADER, parseSemicolonCsv, splitList } from "./productsCsv.js";

describe("productsCsv helpers", () => {
  it("parses semicolon-separated CSV with quoted fields", () => {
    const csv = [
      "Name;Description;Tags",
      '"Bot;Name";"Line with ""quotes""; and semicolon";"alpha|beta"',
    ].join("\n");

    const rows = parseSemicolonCsv(Buffer.from(csv, "utf-8"));

    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe("Bot;Name");
    expect(rows[0].Description).toBe('Line with "quotes"; and semicolon');
    expect(rows[0].Tags).toBe("alpha|beta");
  });

  it("splits tags and categories by pipe or comma", () => {
    expect(splitList("alpha|beta, gamma")).toEqual(["alpha", "beta", "gamma"]);
    expect(splitList("cat-one,cat-two|cat-three")).toEqual(["cat-one", "cat-two", "cat-three"]);
  });

  it("keeps export/import headers aligned, including Leverage", () => {
    expect(HEADER).toContain("Leverage");
    for (const key of FIXED_FIELD_KEYS) {
      expect(HEADER).toContain(key);
    }
  });
});
