import { describe, expect, it } from "vitest";
import { normalizeAddress } from "../src/address.js";

describe("normalizeAddress", () => {
  it("trims, collapses whitespace, and normalizes case", () => {
    expect(normalizeAddress("  380  New\tYork\nSt,  Redlands CA  "))
      .toBe("380 new york st, redlands ca");
  });
});
