import { describe, expect, it } from "vitest";
import { parseMonthlyBillInputs } from "./monthlyBills";

describe("parseMonthlyBillInputs", () => {
  it("converts empty months to zero and preserves January–December order", () => {
    const values = Array.from({ length: 12 }, (_, index) => String(index + 1));
    values[2] = "";
    expect(parseMonthlyBillInputs(values)).toEqual([1, 2, 0, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it.each(["-1", "1.234", "abc", "$12", "1,000"])("rejects invalid currency %s", (value) => {
    expect(() => parseMonthlyBillInputs([value, ...Array(11).fill("")])).toThrow(/January/);
  });

  it("requires exactly twelve values", () => {
    expect(() => parseMonthlyBillInputs(["1"])).toThrow(/twelve/);
  });
});
